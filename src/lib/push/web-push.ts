import "server-only";
import webpush, { WebPushError } from "web-push";

/**
 * Thin wrapper around the `web-push` library.
 *
 * Centralizes VAPID setup in one place so a botched env-var setup fails
 * loudly once at module-load time, not silently on every send. Also
 * gives us a single spot to log failures and to strip 410-Gone
 * subscriptions on the caller's behalf.
 */

let configured = false;

/**
 * Lazy-configure VAPID. Throws on missing env — this is intentional:
 * a production deploy without VAPID keys is a bug and we want the first
 * cron run to fail visibly instead of silently no-oping.
 */
function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";
  if (!publicKey) throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY fehlt");
  if (!privateKey) throw new Error("VAPID_PRIVATE_KEY fehlt");
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

/** Shape we expect from `PushSubscription.toJSON()` stored in our DB. */
export type StoredSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

/** JSON payload we stringify into the push body. */
export type PushPayload = {
  title: string;
  body: string;
  /** Where the user should land on click. Relative path. */
  url: string;
  /** Lets the SW dedupe / replace an earlier unopened notification. */
  tag?: string;
};

export type SendResult =
  | { ok: true }
  | { ok: false; reason: "gone"; statusCode: 410 | 404 }
  | { ok: false; reason: "other"; statusCode?: number; message: string };

/**
 * Send a single push. Classifies failures so the caller can delete dead
 * subscriptions without wrestling with `WebPushError` internals.
 *
 * - 404 / 410: endpoint is gone, caller should delete the row.
 * - everything else: log + move on. Transient failures (e.g. FCM 500s)
 *   will be retried on the next cron tick; no in-app retry queue.
 */
export async function sendPush(
  sub: StoredSubscription,
  payload: PushPayload,
): Promise<SendResult> {
  ensureConfigured();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 12 }, // 12h — matches "today's reminder", older is stale
    );
    return { ok: true };
  } catch (err) {
    if (err instanceof WebPushError) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        return { ok: false, reason: "gone", statusCode: err.statusCode };
      }
      return {
        ok: false,
        reason: "other",
        statusCode: err.statusCode,
        message: err.body || err.message,
      };
    }
    return {
      ok: false,
      reason: "other",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
