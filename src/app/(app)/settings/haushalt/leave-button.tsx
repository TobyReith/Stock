"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
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
import { leaveHousehold } from "@/lib/actions/households";

type Props = {
  householdId: string;
  householdName: string;
  /**
   * True when the user is the only owner of the household. We still
   * render the button (with a disabled tooltip) so the path is
   * discoverable, but block the confirm.
   */
  isLastOwner: boolean;
};

/**
 * Self-leave flow. Confirm-first because leaving is instantly
 * destructive: the user loses read access on the next render.
 *
 * The server action clears the active-household cookie, so after a
 * successful leave we push to `/` and refresh — the home page's
 * active-household resolve will either pick another membership or show
 * the empty state, whichever is accurate.
 */
export function LeaveButton({ householdId, householdName, isLastOwner }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirmLeave() {
    startTransition(async () => {
      const result = await leaveHousehold(householdId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${householdName} verlassen.`);
      setOpen(false);
      router.push("/");
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={isLastOwner}
        aria-describedby={isLastOwner ? "leave-disabled-hint" : undefined}
      >
        <LogOut aria-hidden /> Haushalt verlassen
      </Button>
      {isLastOwner && (
        <p id="leave-disabled-hint" className="text-xs text-muted">
          Du bist der letzte Owner — befördere zuerst jemand anderen.
        </p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{householdName} verlassen?</DialogTitle>
            <DialogDescription>
              Du verlierst sofort den Zugriff auf den geteilten Vorrat. Du
              kannst später mit einem neuen Einladungscode wieder beitreten.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmLeave}
              disabled={pending}
            >
              {pending ? "Verlasse…" : "Verlassen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
