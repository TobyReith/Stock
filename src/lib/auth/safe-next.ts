/**
 * Only allow same-origin relative paths. A raw external URL (or the
 * protocol-relative `//host` form) would let a tampered auth link redirect
 * the user off-site after login — belt-and-suspenders on top of the
 * `/auth/callback` re-validation.
 *
 * Exported so login, signup, forgot-password and the callback route all
 * validate the `?next=` param the same way.
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}
