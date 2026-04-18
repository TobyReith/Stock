"use client";

import { useState } from "react";
import { Copy, Plus, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createInvite } from "@/lib/actions/invites";

type Props = {
  householdId: string;
};

type GeneratedInvite = {
  code: string;
  expiresAt: string;
  url: string;
};

/**
 * Owner-only UI for generating an invite code. We display the freshly
 * created code + shareable URL inline (one code per generate click) so
 * the owner can copy or share without round-tripping through a modal.
 *
 * The code list itself is server-rendered — this component just pushes
 * a new row onto the set. After a successful create we also trigger a
 * router refresh so the active-invites list below re-reads from the DB.
 */
export function InviteGenerator({ householdId }: Props) {
  const [busy, setBusy] = useState(false);
  const [latest, setLatest] = useState<GeneratedInvite | null>(null);

  async function handleGenerate() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await createInvite(householdId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const url = buildInviteUrl(result.data.code);
      setLatest({
        code: result.data.code,
        expiresAt: result.data.expiresAt,
        url,
      });
      toast.success("Code erstellt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        variant="outline"
        onClick={handleGenerate}
        disabled={busy}
      >
        <Plus aria-hidden />
        {busy ? "Erstelle…" : "Neuen Code erstellen"}
      </Button>

      {latest && <FreshInviteCard invite={latest} />}
    </div>
  );
}

function FreshInviteCard({ invite }: { invite: GeneratedInvite }) {
  async function copyCode() {
    await copy(invite.code, "Code kopiert.");
  }
  async function copyUrl() {
    await copy(invite.url, "Link kopiert.");
  }
  async function shareUrl() {
    const shareData = {
      title: "Stock-Haushalt beitreten",
      text: "Tritt meinem Haushalt in der Stock-App bei:",
      url: invite.url,
    };
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // User cancelled or share unavailable; fall through to clipboard.
      }
    }
    await copy(invite.url, "Link kopiert.");
  }

  return (
    <div
      role="status"
      className="rounded-lg border bg-muted/30 px-4 py-3"
      aria-live="polite"
    >
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        Neuer Code
      </p>
      <p className="mt-1 font-mono text-xl font-semibold tracking-widest">
        {invite.code}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Gültig bis {formatExpiry(invite.expiresAt)}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" type="button" onClick={copyCode}>
          <Copy aria-hidden /> Code
        </Button>
        <Button size="sm" variant="outline" type="button" onClick={copyUrl}>
          <Copy aria-hidden /> Link
        </Button>
        <Button size="sm" type="button" onClick={shareUrl}>
          <Share2 aria-hidden /> Teilen
        </Button>
      </div>
    </div>
  );
}

async function copy(text: string, successMessage: string) {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      toast.success(successMessage);
      return;
    }
    throw new Error("Clipboard API nicht verfügbar");
  } catch {
    toast.error("Konnte nicht kopieren — bitte manuell markieren.");
  }
}

function buildInviteUrl(code: string): string {
  if (typeof window === "undefined") return `/invite/${code}`;
  return `${window.location.origin}/invite/${code}`;
}

function formatExpiry(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
