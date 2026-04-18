"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clearActiveHouseholdCookie } from "@/lib/households/active";
import {
  updateProfileSchema,
  type UpdateProfileInput,
} from "@/lib/schemas/auth";

/**
 * Auth-scope server actions: sign out, delete account, profile edit.
 *
 * Sign-out / delete invalidate the user's session and clear the active-
 * household cookie so nothing leaks across refreshes. The caller is
 * expected to redirect the browser to `/login` after a successful call
 * (we don't redirect from the server action itself — keeping the
 * navigation on the client lets the button show pending state cleanly
 * and avoids the mid-stream redirect throw pattern).
 */

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

// ----- Sign out ---------------------------------------------------------

/**
 * End the current Supabase session. Clears the active-household cookie
 * so the *next* user on this device doesn't inherit a stale selection.
 */
export async function signOut(): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    if (error) return fail(error.message);

    await clearActiveHouseholdCookie();
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unbekannter Fehler");
  }
}

// ----- Delete account ---------------------------------------------------

/**
 * Permanently delete the signed-in user's account and everything owned
 * by them.
 *
 * Cascade strategy — see `supabase/migrations/20260418150000_relax_user_fks.sql`:
 *   1. For every household the user is *sole owner* of, delete the
 *      household first. That cascades items, memberships, and invites
 *      via the existing `on delete cascade` FKs — cleaner than relying
 *      on orphaned rows surviving after auth deletion.
 *   2. Call `admin.auth.admin.deleteUser()`. With the FKs relaxed, this
 *      cascades:
 *        - `household_members`       → cascade (rows deleted)
 *        - `push_subscriptions`      → cascade
 *        - `invites.created_by`      → cascade
 *        - `invite_attempts`         → cascade
 *        - `invites.redeemed_by`     → set null
 *        - `items.added_by`          → set null (audit lost, row kept)
 *        - `households.created_by`   → set null (for households the user
 *           created but handed off — co-owners keep the household).
 *   3. Sign out the local session + clear cookies.
 *
 * Guard: if a household has multiple owners we deliberately leave it
 * alone — the user's membership simply vanishes via cascade, and the
 * other owner keeps working. That matches the intent of "delete *my*
 * account" rather than "nuke every household I touched."
 */
export async function deleteAccount(): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("Nicht angemeldet");

    const admin = createAdminClient();

    // Step 1: find households where the user is the sole owner.
    // We do this before the auth delete so the cascade wipes items +
    // invites + other members' memberships atomically per household.
    const { data: ownerRows, error: ownerErr } = await admin
      .from("household_members")
      .select("household_id")
      .eq("user_id", user.id)
      .eq("role", "owner");
    if (ownerErr) return fail(ownerErr.message);

    for (const { household_id } of ownerRows ?? []) {
      const { count, error: countErr } = await admin
        .from("household_members")
        .select("*", { count: "exact", head: true })
        .eq("household_id", household_id)
        .eq("role", "owner");
      if (countErr) return fail(countErr.message);

      if ((count ?? 0) <= 1) {
        // Sole owner → delete the household. Cascades everything in it.
        const { error: delErr } = await admin
          .from("households")
          .delete()
          .eq("id", household_id);
        if (delErr) return fail(delErr.message);
      }
      // Co-owned → leave the household untouched; the user's own
      // membership row will vanish via the auth-cascade below.
    }

    // Step 2: delete the auth user. All remaining FKs are set up to
    // either cascade the dependent row or null out the audit column.
    const { error: authErr } = await admin.auth.admin.deleteUser(user.id);
    if (authErr) return fail(authErr.message);

    // Step 3: clear our own session state. The session on Supabase's side
    // is already dead (the user no longer exists), but the cookie jar on
    // our domain still carries the tokens — drop them so the next request
    // is cleanly anonymous.
    await supabase.auth.signOut();
    await clearActiveHouseholdCookie();
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unbekannter Fehler");
  }
}

// ----- Update profile --------------------------------------------------

/**
 * Update the signed-in user's display name. Writes to Supabase's
 * `user_metadata.full_name`; we don't keep a mirror `profiles` row yet,
 * so this is the single source of truth for "what should we call them".
 *
 * Uses the user-scoped client on purpose — `updateUser` only touches
 * the caller's own auth row, no admin escalation required.
 */
export async function updateProfile(
  input: UpdateProfileInput,
): Promise<ActionResult> {
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Ungültige Eingabe");
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("Nicht angemeldet");

    const { error } = await supabase.auth.updateUser({
      data: { full_name: parsed.data.name },
    });
    if (error) return fail(error.message);

    revalidatePath("/settings");
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unbekannter Fehler");
  }
}
