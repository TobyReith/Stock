import { daysUntil } from "@/lib/date";
import type { PushPayload } from "./web-push";

/**
 * Turn a user's expiring-items snapshot into exactly one push payload
 * — or nothing, when there's nothing worth pinging about.
 *
 * Design choices:
 * - **One push per user per day, max.** Multiple notifications per user
 *   feel like spam and get quickly disabled. We always collapse into one.
 * - **Two-tier urgency:** "today or overdue" beats "in the next N days".
 *   The title tells the user which tier they're in so they can triage
 *   from the lock screen without opening the app.
 * - **German plural-aware wording.** "1 Artikel" vs "3 Artikel", "heute"
 *   vs "bis morgen" vs "in den nächsten 3 Tagen".
 */

/** Item rows the cron endpoint supplies — narrowly typed to exactly what we need. */
export type ExpiringItem = {
  id: string;
  displayName: string;
  bestBefore: string; // YYYY-MM-DD
};

export type BuildParams = {
  items: ExpiringItem[];
  /** Horizon used by the cron; lets the copy say "in den nächsten 3 Tagen". */
  horizonDays: number;
  /** Override for tests. */
  now?: Date;
};

/**
 * Returns `null` when the user has nothing expiring in the window — the
 * cron loop then simply skips the user's subscriptions for this day.
 */
export function buildNotification(params: BuildParams): PushPayload | null {
  const { items, horizonDays, now = new Date() } = params;
  if (items.length === 0) return null;

  const urgent = items.filter((i) => daysUntil(i.bestBefore, now) <= 0);
  const soon = items.filter((i) => {
    const d = daysUntil(i.bestBefore, now);
    return d > 0 && d <= horizonDays;
  });

  const { title, body } =
    urgent.length > 0
      ? urgentCopy(urgent, soon)
      : soonCopy(soon, horizonDays);

  return {
    title,
    body,
    url: "/",
    // Single daily tag per-user — the SW uses this to replace the previous
    // day's unopened reminder rather than stacking them in the tray.
    tag: "stock-daily-mhd",
  };
}

function urgentCopy(
  urgent: ExpiringItem[],
  soon: ExpiringItem[],
): { title: string; body: string } {
  const urgentCount = urgent.length;
  const totalSoon = soon.length;

  const title =
    urgentCount === 1
      ? "1 Artikel ist heute fällig"
      : `${urgentCount} Artikel sind heute fällig`;

  // Body: list up to 3 urgent items by name, then optionally note the
  // "bald fällig" tail so the user sees at a glance what else is coming.
  const names = urgent.slice(0, 3).map((i) => i.displayName);
  const overflow = urgent.length - names.length;
  let body = names.join(", ");
  if (overflow > 0) body += ` und ${overflow} weitere`;
  if (totalSoon > 0) {
    body += `. Außerdem ${totalSoon} bald fällig.`;
  }
  return { title, body };
}

function soonCopy(
  soon: ExpiringItem[],
  horizonDays: number,
): { title: string; body: string } {
  const count = soon.length;
  const horizonPhrase =
    horizonDays === 1 ? "morgen" : `in den nächsten ${horizonDays} Tagen`;

  const title =
    count === 1
      ? `1 Artikel wird ${horizonPhrase} fällig`
      : `${count} Artikel werden ${horizonPhrase} fällig`;

  const names = soon.slice(0, 3).map((i) => i.displayName);
  const overflow = count - names.length;
  let body = names.join(", ");
  if (overflow > 0) body += ` und ${overflow} weitere`;
  return { title, body };
}
