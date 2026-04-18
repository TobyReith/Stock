/**
 * Map raw Supabase auth error strings to user-facing copy.
 *
 * One mapper, two callsites — login and signup share most error shapes
 * (rate limiting, weak password) and only diverge on a few domain-
 * specific ones. Keeping the logic in one place means the copy stays
 * consistent and a new branch added for one flow is automatically
 * available to the other.
 *
 * Anything unmapped falls through as the raw Supabase string so the
 * user still sees a hint rather than silence — better a slightly techy
 * error than none at all.
 */
export type AuthErrorDomain = "login" | "signup";

export function friendlyAuthError(raw: string, domain: AuthErrorDomain): string {
  const msg = raw.toLowerCase();

  // Shared branches — both login and signup hit the same Supabase rate
  // limiter, and both can surface password-related failures.
  if (msg.includes("rate limit")) {
    return "Zu viele Versuche. Bitte später erneut.";
  }

  if (domain === "login") {
    if (msg.includes("invalid login")) {
      return "E-Mail oder Passwort stimmen nicht.";
    }
    if (msg.includes("email not confirmed")) {
      return "Bitte bestätige zuerst deine E-Mail-Adresse.";
    }
    return raw;
  }

  // signup
  if (msg.includes("already registered") || msg.includes("user already")) {
    return "Diese E-Mail ist bereits registriert. Melde dich stattdessen an.";
  }
  if (msg.includes("weak password") || msg.includes("password")) {
    return "Passwort ist zu schwach. Mindestens 8 Zeichen wählen.";
  }
  return raw;
}
