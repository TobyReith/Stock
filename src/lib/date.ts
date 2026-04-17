/**
 * Tiny date helpers for MHD-relative formatting.
 *
 * We deliberately keep this dependency-free — no date-fns — because the
 * needs are narrow (days-until integer + German relative label) and a
 * library would drag in ~40 KB for four functions.
 *
 * All calculations are "calendar-day" based: `daysUntil` snaps to local
 * midnight so "today" always means 0, regardless of clock time.
 */

/**
 * Integer number of calendar days from `now` until the ISO date string.
 * Negative if the date is in the past.
 *
 * Uses local midnight on both ends so edge-of-day clock skew can't flip
 * the sign. "2026-04-17" evaluated on 2026-04-17 23:59 → 0, not -1.
 */
export function daysUntil(isoDate: string, now: Date = new Date()): number {
  const target = new Date(`${isoDate}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ms = target.getTime() - today.getTime();
  return Math.round(ms / 86_400_000);
}

/** Classification used for list grouping and badge color. */
export type MhdUrgency = "expired" | "soon" | "later";

/**
 * Bucket an MHD date into one of three urgency tiers.
 *
 * Thresholds chosen empirically from how the app will be used:
 *   - expired: MHD today or earlier (user should act)
 *   - soon:    next ~3 days — shopping horizon for most households
 *   - later:   everything else
 *
 * Tune if list-grouping feels noisy once real usage kicks in.
 */
export function mhdUrgency(isoDate: string, now: Date = new Date()): MhdUrgency {
  const days = daysUntil(isoDate, now);
  if (days <= 0) return "expired";
  if (days <= 3) return "soon";
  return "later";
}

/**
 * Render a days-until value as a German relative phrase.
 *
 * Examples:
 *   3  → "in 3 Tagen"
 *   1  → "morgen"
 *   0  → "heute"
 *  -1  → "seit gestern abgelaufen"
 *  -5  → "vor 5 Tagen abgelaufen"
 */
export function formatMhdRelative(days: number): string {
  if (days === 0) return "heute";
  if (days === 1) return "morgen";
  if (days === -1) return "seit gestern abgelaufen";
  if (days < 0) return `vor ${Math.abs(days)} Tagen abgelaufen`;
  return `in ${days} Tagen`;
}

/**
 * Format an ISO date ("YYYY-MM-DD") as German "DD.MM.YYYY" for display.
 */
export function formatDateDe(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}
