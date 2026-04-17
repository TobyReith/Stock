"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getCurrentSubscription,
  getPushSupport,
  serializeSubscription,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push/client";
import {
  deletePushSubscription,
  savePushSubscription,
} from "@/lib/actions/push";

type Props = {
  vapidPublicKey: string;
};

type ToggleState =
  | { kind: "loading" }
  | { kind: "unsupported"; message: string }
  | { kind: "blocked" }
  | { kind: "ready"; enabled: boolean };

/**
 * Client-side opt-in toggle.
 *
 * The permission flow is inherently stateful across three boundaries —
 * the browser's `Notification.permission`, the SW's `PushManager`
 * subscription, and our DB row — so we collapse it into a single enum
 * state here and keep the rendering dumb.
 *
 * Edge cases the UI surfaces specifically (not as a generic error):
 *   - browser doesn't do Web Push (old desktop, non-standalone iOS)
 *   - permission = "denied" (user can only fix in browser settings)
 *   - no VAPID key configured (happens in local dev before env setup)
 */
export function PushToggle({ vapidPublicKey }: Props) {
  const [state, setState] = useState<ToggleState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const support = getPushSupport();
      if (!support.supported) {
        if (cancelled) return;
        setState({
          kind: "unsupported",
          message:
            "Benachrichtigungen werden in diesem Browser nicht unterstützt. Auf iOS muss Stock als App installiert sein (ab iOS 16.4).",
        });
        return;
      }
      if (support.permission === "denied") {
        if (cancelled) return;
        setState({ kind: "blocked" });
        return;
      }
      const current = await getCurrentSubscription();
      if (cancelled) return;
      setState({
        kind: "ready",
        enabled: current !== null && support.permission === "granted",
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleToggle(nextEnabled: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      if (nextEnabled) {
        const result = await subscribeToPush(vapidPublicKey);
        if (!result.ok) {
          toast.error(subscribeErrorMessage(result.reason, result.message));
          if (result.reason === "denied") setState({ kind: "blocked" });
          return;
        }
        const payload = serializeSubscription(result.subscription);
        const saved = await savePushSubscription(payload);
        if (!saved.ok) {
          // Roll the client subscription back so DB and browser stay in sync.
          await unsubscribeFromPush();
          toast.error(saved.error);
          return;
        }
        setState({ kind: "ready", enabled: true });
        toast.success("Benachrichtigungen aktiviert.");
      } else {
        const removed = await unsubscribeFromPush();
        if (removed) {
          const deleted = await deletePushSubscription(removed.endpoint);
          if (!deleted.ok) {
            // Local subscription is already gone — worst case we leave a
            // stale row that the cron will prune on the next 410 Gone.
            console.warn("deletePushSubscription fehlgeschlagen", deleted.error);
          }
        }
        setState({ kind: "ready", enabled: false });
        toast.success("Benachrichtigungen deaktiviert.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (state.kind === "loading") {
    return (
      <ToggleCard
        label="Benachrichtigungen"
        description="Wird geladen…"
        enabled={false}
        disabled
      />
    );
  }

  if (state.kind === "unsupported") {
    return (
      <ToggleCard
        label="Benachrichtigungen"
        description={state.message}
        enabled={false}
        disabled
      />
    );
  }

  if (state.kind === "blocked") {
    return (
      <ToggleCard
        label="Benachrichtigungen"
        description="Im Browser blockiert. Bitte in den Browser-Einstellungen für diese Seite erlauben und neu laden."
        enabled={false}
        disabled
      />
    );
  }

  return (
    <ToggleCard
      label="MHD-Erinnerungen"
      description="Tägliche Push-Benachrichtigung, wenn Artikel bald ablaufen."
      enabled={state.enabled}
      busy={busy}
      onChange={handleToggle}
    />
  );
}

function subscribeErrorMessage(
  reason: "denied" | "unsupported" | "no-vapid" | "error",
  message?: string,
): string {
  switch (reason) {
    case "denied":
      return "Benachrichtigungen wurden abgelehnt.";
    case "unsupported":
      return "Benachrichtigungen werden hier nicht unterstützt.";
    case "no-vapid":
      return "Konfiguration unvollständig (VAPID-Key fehlt).";
    case "error":
      return message ?? "Konnte Benachrichtigungen nicht aktivieren.";
  }
}

type ToggleCardProps = {
  label: string;
  description: string;
  enabled: boolean;
  disabled?: boolean;
  busy?: boolean;
  onChange?: (next: boolean) => void;
};

function ToggleCard({
  label,
  description,
  enabled,
  disabled,
  busy,
  onChange,
}: ToggleCardProps) {
  const Icon = enabled ? Bell : BellOff;
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border px-4 py-3">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <Icon aria-hidden className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">{label}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={label}
        disabled={disabled || busy}
        onClick={() => onChange?.(!enabled)}
        className={cn(
          "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
          "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          enabled ? "bg-foreground" : "bg-input",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "inline-block size-5 transform rounded-full bg-background transition-transform",
            enabled ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}
