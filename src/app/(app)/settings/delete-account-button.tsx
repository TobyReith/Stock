"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
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
import { deleteAccount } from "@/lib/actions/auth";

/**
 * Account deletion — confirm-first because the consequences are
 * irreversible and cross-user:
 *   - the user's own data (push subs, invite attempts) is gone
 *   - every household they are the *sole owner* of is deleted, taking
 *     its items and any other members' access with it
 *   - households they co-own keep working for the other owners
 *
 * The dialog copy spells that out so no one loses a shared flat's
 * vorrat by tapping the wrong button.
 */
export function DeleteAccountButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteAccount();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      toast.success("Konto gelöscht.");
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2 aria-hidden /> Konto löschen
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Konto endgültig löschen?</DialogTitle>
            <DialogDescription>
              Dein Zugang und alle zugehörigen Daten werden entfernt.
              Haushalte, in denen du der einzige Owner bist, werden mit
              allen Artikeln mit gelöscht. Geteilte Haushalte bleiben für
              die anderen Mitglieder erhalten.
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
              onClick={confirmDelete}
              disabled={pending}
            >
              {pending ? "Lösche…" : "Endgültig löschen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
