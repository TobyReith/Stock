"use client";

import { useState, useTransition } from "react";
import { UserMinus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { removeMember } from "@/lib/actions/households";

export type MemberRow = {
  userId: string;
  email: string | null;
  role: "owner" | "member";
  joinedAt: string;
};

type Props = {
  householdId: string;
  members: MemberRow[];
  currentUserId: string;
  isOwner: boolean;
};

/**
 * Member list with owner-side remove controls. Removal opens a confirm
 * dialog so an accidental tap doesn't kick someone out silently —
 * membership is destructive, their items stay in the household but they
 * lose read access immediately on next revalidate.
 *
 * Optimistic UX: we hide the row as soon as the action starts, and roll
 * back on failure. The server action revalidates `/settings/haushalt`,
 * so the next RSC paint no longer has the row either.
 */
export function MemberList({ householdId, members, currentUserId, isOwner }: Props) {
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<MemberRow | null>(null);

  const visible = members.filter((m) => !removed.has(m.userId));

  function confirmRemove() {
    if (!target) return;
    const userId = target.userId;
    setRemoved((prev) => new Set(prev).add(userId));
    setTarget(null);
    startTransition(async () => {
      const result = await removeMember(householdId, userId);
      if (!result.ok) {
        setRemoved((prev) => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
        toast.error(result.error);
        return;
      }
      toast.success("Mitglied entfernt.");
    });
  }

  return (
    <>
      <ul className="flex flex-col divide-y rounded-lg border">
        {visible.map((m) => {
          const isSelf = m.userId === currentUserId;
          const canRemove = isOwner && !isSelf && m.role !== "owner";
          return (
            <li
              key={m.userId}
              className="flex items-center justify-between gap-3 px-4 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.email ?? "Unbekannte Adresse"}
                  {isSelf && (
                    <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
                      Du
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {m.role === "owner" ? "Owner" : "Mitglied"} · dabei seit{" "}
                  {formatJoined(m.joinedAt)}
                </p>
              </div>
              {canRemove && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${m.email ?? "Mitglied"} entfernen`}
                  disabled={pending}
                  onClick={() => setTarget(m)}
                >
                  <UserMinus aria-hidden />
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      <Dialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mitglied entfernen?</DialogTitle>
            <DialogDescription>
              {target?.email ?? "Das Mitglied"} verliert den Zugriff auf diesen
              Haushalt. Bereits hinzugefügte Artikel bleiben erhalten.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setTarget(null)}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmRemove}
              disabled={pending}
            >
              Entfernen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatJoined(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
