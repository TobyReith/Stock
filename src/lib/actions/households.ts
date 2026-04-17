import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Returns the user's active household ID, creating one on first use.
 *
 * Phase 1 invariant: each user has exactly one default household
 * ("Mein Haushalt"). Multi-household / invites land in Phase 2.
 *
 * ## Why the admin client for the bootstrap INSERTs
 * The user-scoped Supabase client (`@supabase/ssr`) is used for the
 * membership read — RLS there is permissive (`is_household_member`) and
 * that's what we want.
 *
 * For the `households` + `household_members` **creation** step, we use
 * the service_role client instead, for two reasons:
 *
 * 1. **Trust boundary is already crossed.** The caller has just verified
 *    the user via `supabase.auth.getUser()` (see `addItem`). The user ID
 *    we pass in is authoritative.
 * 2. **RLS for self-bootstrap is awkward.** The natural policy
 *    `created_by = auth.uid()` turned out to reject the insert in
 *    practice (PostgREST routes correctly, but the WITH CHECK still
 *    fails — suspected interaction between `auth.uid()` STABLE caching
 *    and the INSERT…RETURNING pipeline under PostgREST). Rather than
 *    chase the edge case, we lift the write out of the user context,
 *    which is the same pattern ADR-0002 uses for the `products` cache.
 *
 * The user-context client is still passed in so the cheap membership
 * check stays inside RLS (most calls return early here).
 */
export async function ensureHousehold(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string> {
  // Existing membership? Take the first one. Runs under the user's
  // session, so it respects `household_members_select_peers`.
  const { data: membership, error: memErr } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (memErr) throw new Error(`Mitgliedschaft prüfen: ${memErr.message}`);
  if (membership) return membership.household_id;

  // Bootstrap path — service_role. See the docstring above for the
  // rationale. Safe because `userId` was just authenticated by the
  // caller.
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

  return household.id;
}
