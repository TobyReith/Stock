"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  clearActiveHouseholdCookie,
  setActiveHouseholdCookie,
} from "@/lib/households/active";
import { type ActionResult, fail } from "@/lib/actions/result";

export type { ActionResult };

/**
 * Household-scope server actions: switch active, rename, leave, and
 * remove members.
 *
 * ## Trust model
 * - `switchActiveHousehold` runs against the user client; we verify the
 *   target membership via RLS-protected SELECT before writing the cookie.
 * - `renameHousehold` runs against the user client; RLS
 *   (`households_update_owner`) enforces owner-only. We don't re-check
 *   in code to keep one source of truth.
 * - `leaveHousehold` and `removeMember` use the admin client because the
 *   default `household_members` policies only let non-owners self-leave.
 *   Owner-with-co-owner leave and owner-removes-member both need admin,
 *   and putting the two paths in one helper keeps the "not-last-owner"
 *   invariant in one place.
 *
 * In every admin path we first resolve `auth.getUser()` with the user
 * client — the JWT is verified there, so the user id we pass to the
 * admin is authoritative.
 */

const householdIdSchema = z.string().uuid("Ungültiger Haushalt");
const userIdSchema = z.string().uuid("Ungültiger Benutzer");
const householdNameSchema = z
  .string()
  .trim()
  .min(1, "Name darf nicht leer sein")
  .max(80, "Max. 80 Zeichen");

// ----- Switch -----------------------------------------------------------

/**
 * Persist the user's active household. Verifies membership before
 * writing — a stale cookie would be harmless (we re-validate on every
 * read) but setting one for a household the user just left would silently
 * produce an empty list, which is confusing.
 *
 * Revalidates the entire app tree because every scoped page (list, stats,
 * item detail, settings) needs to re-render against the new household.
 */
export async function switchActiveHousehold(
  householdId: string,
): Promise<ActionResult> {
  const parsed = householdIdSchema.safeParse(householdId);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Ungültige Eingabe");
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("Nicht angemeldet");

    const { data, error } = await supabase
      .from("household_members")
      .select("household_id")
      .eq("household_id", parsed.data)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) return fail(error.message);
    if (!data) return fail("Du bist kein Mitglied dieses Haushalts.");

    await setActiveHouseholdCookie(parsed.data);
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unbekannter Fehler");
  }
}

// ----- Rename -----------------------------------------------------------

/**
 * Rename a household. RLS (`households_update_owner`) enforces that
 * only owners can update; a non-owner call will simply update zero rows
 * and we surface that as a success (idempotent-ish) because the user's
 * read path will show the unchanged name anyway — re-checking membership
 * here would just duplicate the RLS boundary.
 */
export async function renameHousehold(
  householdId: string,
  name: string,
): Promise<ActionResult> {
  const parsedId = householdIdSchema.safeParse(householdId);
  if (!parsedId.success) {
    return fail(parsedId.error.issues[0]?.message ?? "Ungültige Eingabe");
  }
  const parsedName = householdNameSchema.safeParse(name);
  if (!parsedName.success) {
    return fail(parsedName.error.issues[0]?.message ?? "Ungültiger Name");
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("Nicht angemeldet");

    const { error } = await supabase
      .from("households")
      .update({ name: parsedName.data })
      .eq("id", parsedId.data);
    if (error) return fail(error.message);

    revalidatePath("/settings/haushalt");
    revalidatePath("/");
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unbekannter Fehler");
  }
}

// ----- Leave -----------------------------------------------------------

/**
 * Leave a household.
 *
 * Guard: the last owner can't leave — removing them would orphan the
 * household with no one able to manage invites or rename it. The UI
 * hides the button in that case, but we re-check here because this is
 * the boundary that actually matters.
 *
 * Side effect: clears the active-household cookie. The next page render
 * calls `getActiveHouseholdId`, which picks a remaining membership or
 * returns `null` (empty state). We intentionally don't pre-select the
 * "next" household server-side — different users have different mental
 * models and a deterministic re-pick is simpler than trying to guess.
 */
export async function leaveHousehold(
  householdId: string,
): Promise<ActionResult> {
  const parsed = householdIdSchema.safeParse(householdId);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Ungültige Eingabe");
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("Nicht angemeldet");

    const admin = createAdminClient();

    const { data: self, error: selfErr } = await admin
      .from("household_members")
      .select("role")
      .eq("household_id", parsed.data)
      .eq("user_id", user.id)
      .maybeSingle();
    if (selfErr) return fail(selfErr.message);
    if (!self) return fail("Du bist kein Mitglied dieses Haushalts.");

    if (self.role === "owner") {
      const { count, error: countErr } = await admin
        .from("household_members")
        .select("*", { count: "exact", head: true })
        .eq("household_id", parsed.data)
        .eq("role", "owner");
      if (countErr) return fail(countErr.message);
      if ((count ?? 0) <= 1) {
        return fail(
          "Du bist der letzte Owner. Befördere zuerst jemand anderen, bevor du den Haushalt verlässt.",
        );
      }
    }

    const { error: delErr } = await admin
      .from("household_members")
      .delete()
      .eq("household_id", parsed.data)
      .eq("user_id", user.id);
    if (delErr) return fail(delErr.message);

    await clearActiveHouseholdCookie();
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unbekannter Fehler");
  }
}

// ----- Remove member ---------------------------------------------------

/**
 * Owner removes another member. Symmetrical guard to `leaveHousehold`:
 *   - Caller must be an owner (verified here against memberships).
 *   - Caller can't remove themselves here — `leaveHousehold` is the
 *     self-exit path, and it has the last-owner check.
 *   - Another owner can't be removed. Demoting isn't exposed in this
 *     PR; for now, the removed owner has to leave themselves.
 */
export async function removeMember(
  householdId: string,
  memberUserId: string,
): Promise<ActionResult> {
  const parsedId = householdIdSchema.safeParse(householdId);
  if (!parsedId.success) {
    return fail(parsedId.error.issues[0]?.message ?? "Ungültige Eingabe");
  }
  const parsedMember = userIdSchema.safeParse(memberUserId);
  if (!parsedMember.success) {
    return fail(parsedMember.error.issues[0]?.message ?? "Ungültige Eingabe");
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("Nicht angemeldet");
    if (user.id === parsedMember.data) {
      return fail("Zum Verlassen bitte den Verlassen-Button nutzen.");
    }

    const admin = createAdminClient();

    const { data: caller, error: callerErr } = await admin
      .from("household_members")
      .select("role")
      .eq("household_id", parsedId.data)
      .eq("user_id", user.id)
      .maybeSingle();
    if (callerErr) return fail(callerErr.message);
    if (caller?.role !== "owner") {
      return fail("Nur Owner dürfen Mitglieder entfernen.");
    }

    const { data: target, error: targetErr } = await admin
      .from("household_members")
      .select("role")
      .eq("household_id", parsedId.data)
      .eq("user_id", parsedMember.data)
      .maybeSingle();
    if (targetErr) return fail(targetErr.message);
    if (!target) return fail("Mitglied nicht gefunden.");
    if (target.role === "owner") {
      return fail("Owner können nicht entfernt werden.");
    }

    const { error: delErr } = await admin
      .from("household_members")
      .delete()
      .eq("household_id", parsedId.data)
      .eq("user_id", parsedMember.data);
    if (delErr) return fail(delErr.message);

    revalidatePath("/settings/haushalt");
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unbekannter Fehler");
  }
}
