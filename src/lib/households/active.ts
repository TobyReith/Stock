import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The active household id is stored in a cookie. It's a UI-state hint,
 * not a security boundary — RLS on `items`/`household_members` is what
 * actually authorizes access. The cookie just tells us which of the
 * user's households to scope queries to.
 */
export const ACTIVE_HOUSEHOLD_COOKIE = "stock_active_household";

// 1 year. We re-validate against `household_members` on every read
// anyway, so a stale cookie is harmless — worst case the user sees a
// deterministic fallback (first membership) and the switcher re-pins it.
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Persist the chosen active household.
 *
 * Only call from a Server Action or Route Handler — `cookies().set()`
 * throws when invoked during Server Component rendering. The resolve
 * helpers below swallow that error so they're safe in either context.
 */
export async function setActiveHouseholdCookie(
  householdId: string,
): Promise<void> {
  const store = await cookies();
  store.set(ACTIVE_HOUSEHOLD_COOKIE, householdId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

export async function clearActiveHouseholdCookie(): Promise<void> {
  const store = await cookies();
  store.delete(ACTIVE_HOUSEHOLD_COOKIE);
}

/**
 * Resolve the user's active household id — read-only, never mutates.
 *
 * Order:
 *   1. Cookie value, validated against memberships.
 *   2. First membership (deterministic fallback when cookie is stale).
 *   3. `null` when the user has no memberships yet.
 *
 * Safe to call from Server Components. Call sites that need a guaranteed
 * household (writes, bootstrap) should use {@link ensureActiveHousehold}
 * instead.
 *
 * Wrapped in React `cache()`: a single tab-switch commonly resolves the
 * active household multiple times (layout, page, stats helper, …).
 * The underlying `household_members` query is identical each call; the
 * cache dedupes it within a request. Cache key is
 * `(supabase, userId)` — because `createClient()` is itself cached, the
 * supabase argument is referentially stable across the render tree.
 */
export const getActiveHouseholdId = cache(async (
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string | null> => {
  const store = await cookies();
  const cookieValue = store.get(ACTIVE_HOUSEHOLD_COOKIE)?.value ?? null;

  // Load all memberships so we can both validate the cookie and pick a
  // fallback. Phase 2.2's cap of household memberships per user is
  // implicit (there's no UI-imposed limit), but a real user won't have
  // dozens — pulling them all keeps the query simple.
  const { data, error } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId);
  if (error) throw new Error(`Mitgliedschaft prüfen: ${error.message}`);

  const memberships = data ?? [];
  if (memberships.length === 0) return null;

  if (cookieValue && memberships.some((m) => m.household_id === cookieValue)) {
    return cookieValue;
  }
  return memberships[0].household_id;
});

/**
 * Resolve the active household id, bootstrapping a default household
 * when the user has no memberships yet.
 *
 * Only call from trust-crossed contexts (Server Actions / Route
 * Handlers) where the caller has just verified `auth.getUser()` —
 * bootstrap uses the admin client to bypass RLS, so `userId` must be
 * authoritative.
 *
 * ## Why the admin client for the bootstrap INSERTs
 * The user-scoped client's natural policy `created_by = auth.uid()` has
 * historically rejected inserts under PostgREST's `INSERT…RETURNING`
 * pipeline (see the original `ensureHousehold` docstring). We keep the
 * same admin-lift pattern ADR-0002 uses for the `products` cache.
 *
 * Side effect: persists the resolved id to the active-household cookie
 * so subsequent Server Component renders skip the membership query. The
 * cookie write is best-effort — if it fails we still return the id.
 */
export async function ensureActiveHousehold(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string> {
  const existing = await getActiveHouseholdId(supabase, userId);
  if (existing) {
    await trySetCookie(existing);
    return existing;
  }

  // Bootstrap path — user has no memberships yet.
  const admin = createAdminClient();

  const { data: household, error: hhErr } = await admin
    .from("households")
    .insert({ name: "Mein Haushalt", created_by: userId })
    .select("id")
    .single();
  if (hhErr || !household) {
    throw new Error(`Haushalt anlegen: ${hhErr?.message ?? "unbekannt"}`);
  }

  const { error: joinErr } = await admin
    .from("household_members")
    .insert({ household_id: household.id, user_id: userId, role: "owner" });
  if (joinErr) {
    throw new Error(`Mitgliedschaft anlegen: ${joinErr.message}`);
  }

  await trySetCookie(household.id);
  return household.id;
}

async function trySetCookie(id: string): Promise<void> {
  try {
    await setActiveHouseholdCookie(id);
  } catch {
    // Swallowed by design: calling `.set` during Server Component
    // rendering throws. The next Server Action will re-persist, and we
    // fall back to re-resolving from memberships until then.
  }
}

export type MembershipSummary = {
  /** Household id — the stable routing/scoping value. */
  id: string;
  name: string;
  role: "owner" | "member";
};

/**
 * List every household the user belongs to, with role + name. Used to
 * populate the switcher and the settings member-list context.
 *
 * Safe from Server Components — read-only. We rely on the
 * `household_members_select_peers` + `households_select_members`
 * policies to keep the result scoped.
 *
 * The PostgREST single-row join (`households ( id, name )`) is typed as
 * either an object or a single-entry array depending on generator
 * version; we normalize both shapes here so callers get a flat list.
 */
export const listMemberships = cache(async (
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<MembershipSummary[]> => {
  const { data, error } = await supabase
    .from("household_members")
    .select("role, household:households ( id, name )")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true });
  if (error) throw new Error(`Mitgliedschaften laden: ${error.message}`);

  return (data ?? []).flatMap((row) => {
    const h = Array.isArray(row.household) ? row.household[0] : row.household;
    if (!h) return [];
    const role: MembershipSummary["role"] = row.role === "owner" ? "owner" : "member";
    return [{ id: h.id, name: h.name, role }];
  });
});
