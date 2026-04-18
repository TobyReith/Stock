import { z } from "zod";

/**
 * Alphabet used for invite codes. 31 characters, deliberately omitting
 * lookalikes (0/O, 1/I/l) to keep hand-transcribed codes reliable. The
 * matching `CHECK (code ~ '...')` constraint on `invites.code` rejects
 * anything outside this set, including lower-case.
 */
export const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const INVITE_CODE_LENGTH = 6;

const invitePattern = new RegExp(
  `^[${INVITE_ALPHABET}]{${INVITE_CODE_LENGTH}}$`,
);

/**
 * Input for `redeemInvite`. The user-facing form normalizes whitespace
 * and upper-cases before validating, so by the time we check the shape
 * it must be exactly 6 alphabet chars.
 */
export const redeemInviteSchema = z
  .string()
  .regex(invitePattern, "Code muss 6 Zeichen (A–Z ohne O/I, 2–9) haben");

/** Matches UUID v4 as used by `households.id`. */
export const householdIdSchema = z.string().uuid("Ungültiger Haushalt");

/**
 * Normalize a raw code from the user: trim, strip internal whitespace
 * and dashes (some users paste `ABC-DEF` from screenshots), uppercase.
 * Validation happens after this.
 */
export function normalizeInviteCode(raw: string): string {
  return raw.replace(/[\s-]+/g, "").toUpperCase();
}
