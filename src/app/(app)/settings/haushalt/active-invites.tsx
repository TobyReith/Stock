"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { revokeInvite } from "@/lib/actions/invites";

export type InviteRow = {
  code: string;
  expiresAt: string;
};

type Props = {
  invites: InviteRow[];
};

/**
 * Server-rendered list of active (un-redeemed, un-expired) invites
 * with a revoke button per row. We keep an optimistic `removed` set so
 * the row disappears immediately on click — the action revalidates
 * `/settings/haushalt` on success, which re-renders this component
 * without the row.
 */
export function ActiveInvites({ invites }: Props) {
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [pending, startTransition] = useTransition();

  const visible = invites.filter((i) => !removed.has(i.code));

  if (visible.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">
        Keine offenen Codes.
      </div>
    );
  }

  function handleRevoke(code: string) {
    setRemoved((prev) => new Set(prev).add(code));
    startTransition(async () => {
      const result = await revokeInvite(code);
      if (!result.ok) {
        // Roll back the optimistic removal.
        setRemoved((prev) => {
          const next = new Set(prev);
          next.delete(code);
          return next;
        });
        toast.error(result.error);
        return;
      }
      toast.success("Code widerrufen.");
    });
  }

  return (
    <ul className="flex flex-col divide-y rounded-lg border">
      {visible.map((invite) => (
        <li
          key={invite.code}
          className="flex items-center justify-between gap-3 px-4 py-2.5"
        >
          <div className="flex-1 min-w-0">
            <p className="font-mono text-sm font-semibold tracking-widest">
              {invite.code}
            </p>
            <p className="text-xs text-muted-foreground">
              gültig bis {formatExpiry(invite.expiresAt)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Code ${invite.code} widerrufen`}
            disabled={pending}
            onClick={() => handleRevoke(invite.code)}
          >
            <Trash2 aria-hidden />
          </Button>
        </li>
      ))}
    </ul>
  );
}

function formatExpiry(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
