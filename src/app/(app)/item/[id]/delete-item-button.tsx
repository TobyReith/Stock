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
import { deleteItem } from "@/lib/actions/items";

/**
 * Hard-delete for "I added this by mistake" cases.
 *
 * Distinct from Consume / Discard: those close the item (it stays in
 * the DB and feeds the stats). Delete removes the row entirely and
 * should only be used when the item never belonged in the Vorrat in
 * the first place — the Dialog copy reinforces that.
 *
 * Sits outside the `EditItemForm` because the form is still in a
 * pending state after Save/Consume/Discard; nesting another
 * `useTransition` would share the same spinner and confuse the copy.
 */
export function DeleteItemButton({
  itemId,
  itemName,
  disabled = false,
}: {
  itemId: string;
  itemName: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    startTransition(async () => {
      const res = await deleteItem(itemId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Artikel gelöscht");
      setOpen(false);
      router.push("/");
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 aria-hidden /> Artikel löschen
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>&bdquo;{itemName}&ldquo; löschen?</DialogTitle>
            <DialogDescription>
              Der Artikel wird unwiderruflich entfernt und taucht nicht in
              der Statistik auf. Nutze &bdquo;Verbraucht&ldquo; oder
              &bdquo;Entsorgt&ldquo;, wenn du ihn wirklich hattest.
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
              {pending ? "Lösche…" : "Löschen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
