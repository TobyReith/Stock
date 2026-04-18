"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { setActiveHouseholdCookie } from "@/lib/households/active";
import {
  INVITE_ALPHABET,
  INVITE_CODE_LENGTH,
  householdIdSchema,
  normalizeInviteCode,
  redeemInviteSchema,
} from "@/lib/schemas/invites";

/**
 * Invite creation / redemption / revocation.
 *
 * ## Trust model
 * - **Create / revoke** run against the user client — RLS on `invites`
 *   enforces "only owners of `household_id`". We don't need to re-check
 *   ownership in code.
 * - **Redemption** runs under `service_role`:
 *     1. Clients can't SELECT invites they don't own, so we couldn't
 *        validate the code in the user's session anyway.
 *     2. The `UPDATE invites … WHERE redeemed_at IS NULL RETURNING …`
 *        pattern (step 3 in `redeemInvite`) is the single atomic claim —
 *        two concurrent requests race on it and exactly one wins.
 *     3. We also write to `invite_attempts` (deny-all RLS) for rate
 *        limiting, which can only happen with service_role.
 *
 * The authenticated user id is resolved via the *user* client first;
 * that `auth.getUser()` call verifies the JWT before we hand anything
 * to the admin client, so `userId` stays authoritative.
 */

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

// ----- Rate limit --------------------------------------------------------
// Intentionally liberal: multi-device UX means a user might mistype on
// phone, then retype on laptop, and we don't want to lock them out of a
// real code. 5 tries / 10 min still brings brute-force expected-hit time
// over 31^6 / 720 ≈ 3 000 years per user.
const RATE_LIMIT_COUNT = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

// Invite lifetime. Short enough that a leaked screenshot stops working
// in a week; long enough for "generate now, share tomorrow" flows.
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// How many code collisions we tolerate before giving up. With a 31^6
// space (≈ 887M) and a few hundred active invites, collisions are a
// rounding error — a handful of retries is a robustness knob, not a
// business requirement.
const CODE_RETRY_LIMIT = 5;

function generateCode(): string {
  // modulo bias is minimal (256 / 31 ≈ 8.26 → 1% skew) and acceptable
  // for human-readable codes.
  const bytes = randomBytes(INVITE_CODE_LENGTH);
  let out = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    out += INVITE_ALPHABET[bytes[i] % INVITE_ALPHABET.length];
  }
  return out;
}

// ----- Create ------------------------------------------------------------

export type CreateInviteResult = {
  code: string;
  expiresAt: string;
};

export async function createInvite(
  householdId: string,
): Promise<ActionResult<CreateInviteResult>> {
  const parsed = householdIdSchema.safeParse(householdId);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Ungültige Eingabe");

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("Nicht angemeldet");

    const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

    // Retry on PK collisions. Anything else (RLS denial, FK violation)
    // we surface on the first attempt — retrying won't help.
    for (let attempt = 0; attempt < CODE_RETRY_LIMIT; attempt++) {
      const code = generateCode();
      const { error } = await supabase.from("invites").insert({
        code,
        household_id: parsed.data,
        created_by: user.id,
        expires_at: expiresAt,
      });
      if (!error) {
        revalidatePath("/settings/haushalt");
        return { ok: true, data: { code, expiresAt } };
      }
      // `23505` = unique_violation. Postgres code is more reliable than
      // matching on the English message.
      const isCollision =
        (error as { code?: string }).code === "23505" ||
        /duplicate key/i.test(error.message);
      if (!isCollision) return fail(error.message);
    }
    return fail("Code-Kollision — bitte erneut versuchen");
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unbekannter Fehler");
  }
}

// ----- Revoke ------------------------------------------------------------

export async function revokeInvite(code: string): Promise<ActionResult> {
  const parsed = redeemInviteSchema.safeParse(normalizeInviteCode(code));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Ungültiger Code");

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("Nicht angemeldet");

    // RLS `invites_delete_owner` guards this — a non-owner call simply
    // deletes zero rows.
    const { error } = await supabase.from("invites").delete().eq("code", parsed.data);
    if (error) return fail(error.message);

    revalidatePath("/settings/haushalt");
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unbekannter Fehler");
  }
}

// ----- Redeem ------------------------------------------------------------

export type RedeemInviteResult = {
  householdId: string;
  householdName: string;
  /** True when the user was already a member; we didn't consume the code. */
  alreadyMember: boolean;
};

export async function redeemInvite(
  rawCode: string,
): Promise<ActionResult<RedeemInviteResult>> {
  const parsed = redeemInviteSchema.safeParse(normalizeInviteCode(rawCode));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Ungültiger Code");
  }
  const code = parsed.data;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("Nicht angemeldet");

    const admin = createAdminClient();

    // 1. Rate limit.
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count: recentAttempts, error: rateErr } = await admin
      .from("invite_attempts")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("attempted_at", windowStart);
    if (rateErr) return fail(`Rate-Limit-Prüfung: ${rateErr.message}`);
    if ((recentAttempts ?? 0) >= RATE_LIMIT_COUNT) {
      await recordAttempt(user.id, code, false);
      return fail("Zu viele Versuche — bitte in 10 Minuten erneut probieren.");
    }

    // 2. Resolve the invite. Filter on `redeemed_at is null` and
    //    `expires_at > now()` so we can give a useful error without
    //    revealing that the code even exists.
    const { data: invite, error: findErr } = await admin
      .from("invites")
      .select("code, household_id, redeemed_at, expires_at")
      .eq("code", code)
      .maybeSingle();
    if (findErr) return fail(findErr.message);

    const now = Date.now();
    const valid =
      invite &&
      invite.redeemed_at === null &&
      new Date(invite.expires_at).getTime() > now;
    if (!valid) {
      await recordAttempt(user.id, code, false);
      return fail("Code ist ungültig oder abgelaufen.");
    }

    // 3. Already a member? Nothing to consume, just switch.
    const { data: existing, error: memErr } = await admin
      .from("household_members")
      .select("household_id")
      .eq("household_id", invite.household_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (memErr) return fail(memErr.message);

    const household = await loadHouseholdName(admin, invite.household_id);

    if (existing) {
      await recordAttempt(user.id, code, true);
      await setActiveHouseholdCookie(invite.household_id);
      revalidatePath("/");
      revalidatePath("/settings/haushalt");
      return {
        ok: true,
        data: {
          householdId: invite.household_id,
          householdName: household,
          alreadyMember: true,
        },
      };
    }

    // 4. Atomic claim: only one concurrent redeemer wins the UPDATE.
    const { data: claimed, error: claimErr } = await admin
      .from("invites")
      .update({
        redeemed_at: new Date().toISOString(),
        redeemed_by: user.id,
      })
      .eq("code", code)
      .is("redeemed_at", null)
      .select("household_id")
      .maybeSingle();
    if (claimErr) return fail(claimErr.message);
    if (!claimed) {
      // Lost the race; behave like a normal invalid code.
      await recordAttempt(user.id, code, false);
      return fail("Code ist ungültig oder abgelaufen.");
    }

    // 5. Add membership. If someone else added us between steps 3 and 5
    //    we'd get a PK conflict — treat as success (we already got here
    //    via a valid claim).
    const { error: joinErr } = await admin.from("household_members").insert({
      household_id: claimed.household_id,
      user_id: user.id,
      role: "member",
    });
    if (joinErr && (joinErr as { code?: string }).code !== "23505") {
      return fail(joinErr.message);
    }

    await recordAttempt(user.id, code, true);
    await setActiveHouseholdCookie(claimed.household_id);
    revalidatePath("/");
    revalidatePath("/settings/haushalt");
    return {
      ok: true,
      data: {
        householdId: claimed.household_id,
        householdName: household,
        alreadyMember: false,
      },
    };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unbekannter Fehler");
  }
}

// ----- Helpers -----------------------------------------------------------

async function recordAttempt(
  userId: string,
  code: string,
  success: boolean,
): Promise<void> {
  const admin = createAdminClient();
  // Best-effort: we never want to turn a redeem failure into an
  // "attempt-logging failed" error for the user.
  await admin.from("invite_attempts").insert({
    user_id: userId,
    code,
    success,
  });
}

async function loadHouseholdName(
  admin: ReturnType<typeof createAdminClient>,
  householdId: string,
): Promise<string> {
  const { data } = await admin
    .from("households")
    .select("name")
    .eq("id", householdId)
    .maybeSingle();
  return data?.name ?? "Haushalt";
}
