/**
 * Browser-side helpers for PushManager subscribe / unsubscribe.
 *
 * Kept separate from `web-push.ts` (server-only) so we can import this
 * freely from client components without dragging `web-push` — and its
 * Node `crypto` calls — into the client bundle.
 *
 * Every entry point guards for feature support and surfaces a typed
 * reason instead of throwing, so the settings UI can show a specific
 * hint (especially important for iOS, where Web Push requires the PWA
 * installed + iOS 16.4+ and there's no runtime toggle for that).
 */

export type PushSupport =
  | { supported: true; permission: NotificationPermission }
  | { supported: false; reason: "no-sw" | "no-push" | "no-notification" };

export function getPushSupport(): PushSupport {
  if (typeof window === "undefined") {
    return { supported: false, reason: "no-sw" };
  }
  if (!("serviceWorker" in navigator)) {
    return { supported: false, reason: "no-sw" };
  }
  if (!("PushManager" in window)) {
    return { supported: false, reason: "no-push" };
  }
  if (!("Notification" in window)) {
    return { supported: false, reason: "no-notification" };
  }
  return { supported: true, permission: Notification.permission };
}

/**
 * Convert the VAPID public key (base64url) to the `Uint8Array` shape
 * `PushManager.subscribe({ applicationServerKey })` expects.
 *
 * Return type is `Uint8Array<ArrayBuffer>` (not the broader
 * `ArrayBufferLike`) so it satisfies `BufferSource` — TS 5.7+ narrowed
 * the default type parameter and a plain `Uint8Array` no longer fits.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const standard = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(standard);
  const buffer = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/**
 * `navigator.serviceWorker.ready` resolves once the SW is **active** —
 * using it here (vs `register()`) is what guarantees `pushManager` calls
 * don't race against an installing worker.
 */
async function getRegistration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.ready;
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!getPushSupport().supported) return null;
  const reg = await getRegistration();
  return reg.pushManager.getSubscription();
}

export type SubscribeResult =
  | { ok: true; subscription: PushSubscription }
  | {
      ok: false;
      reason: "denied" | "unsupported" | "no-vapid" | "error";
      message?: string;
    };

export async function subscribeToPush(
  vapidPublicKey: string,
): Promise<SubscribeResult> {
  const support = getPushSupport();
  if (!support.supported) return { ok: false, reason: "unsupported" };
  if (!vapidPublicKey) return { ok: false, reason: "no-vapid" };

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, reason: "denied" };

    const reg = await getRegistration();
    // Re-use an existing subscription when present — calling `subscribe`
    // again with a different `applicationServerKey` throws on some
    // browsers, and we assume the VAPID key is stable across deploys.
    const existing = await reg.pushManager.getSubscription();
    if (existing) return { ok: true, subscription: existing };

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    return { ok: true, subscription: sub };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function unsubscribeFromPush(): Promise<{ endpoint: string } | null> {
  if (!getPushSupport().supported) return null;
  const reg = await getRegistration();
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return { endpoint };
}

/**
 * Serialize a `PushSubscription` into the JSON shape we store in
 * `push_subscriptions.keys`. `toJSON()` returns optional fields because
 * the spec allows them to be absent in principle — in practice, any
 * subscription that came from `subscribe()` has both `p256dh` and
 * `auth`, so we fall back to empty strings and let server-side Zod
 * validation reject anything pathological.
 */
export function serializeSubscription(sub: PushSubscription): {
  endpoint: string;
  keys: { p256dh: string; auth: string };
} {
  const json = sub.toJSON();
  return {
    endpoint: json.endpoint ?? sub.endpoint,
    keys: {
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
    },
  };
}
