"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Minus, Package, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  deleteShoppingItem,
  updateShoppingItemDetails,
} from "@/lib/actions/shopping";
import type { ShoppingEntry } from "./shopping-list";

type Props = {
  entry: ShoppingEntry | null;
  onClose: () => void;
  onOptimisticUpdate: (id: string, patch: Partial<ShoppingEntry>) => void;
  onOptimisticRemove: (id: string) => void;
  onRefresh: () => void;
};

export function ShoppingItemSheet({
  entry,
  onClose,
  onOptimisticUpdate,
  onOptimisticRemove,
  onRefresh,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [customName, setCustomName] = useState("");
  const [quantity, setQuantity] = useState<number | null>(null);
  const [unit, setUnit] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (entry) {
      setCustomName(entry.customName ?? "");
      setQuantity(entry.quantity);
      setUnit(entry.unit ?? "");
      setNote(entry.note ?? "");
    }
  }, [entry]);

  function handleSave() {
    if (!entry) return;

    const patch: Parameters<typeof updateShoppingItemDetails>[1] = {};
    if (!entry.productId && customName.trim() !== (entry.customName ?? "")) {
      patch.customName = customName.trim();
    }
    if (quantity !== entry.quantity) patch.quantity = quantity;
    if ((unit.trim() || null) !== entry.unit) patch.unit = unit.trim() || null;
    if ((note.trim() || null) !== entry.note) patch.note = note.trim() || null;

    startTransition(async () => {
      onOptimisticUpdate(entry.id, {
        ...(!entry.productId && patch.customName !== undefined
          ? { customName: patch.customName }
          : {}),
        ...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
        ...(patch.unit !== undefined ? { unit: patch.unit } : {}),
        ...(patch.note !== undefined ? { note: patch.note } : {}),
      });
      const res = await updateShoppingItemDetails(entry.id, patch);
      if (!res.ok) {
        toast.error(res.error);
        onRefresh();
      } else {
        onClose();
        onRefresh();
      }
    });
  }

  function handleDelete() {
    if (!entry) return;
    startTransition(async () => {
      onOptimisticRemove(entry.id);
      const res = await deleteShoppingItem(entry.id);
      if (!res.ok) toast.error(res.error);
      onClose();
      onRefresh();
    });
  }

  const name = entry
    ? (entry.customName ?? entry.productName ?? "Unbenannt")
    : "";

  return (
    <Sheet
      open={entry !== null}
      onOpenChange={(open: boolean) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-8 pt-0">
        <SheetHeader className="px-0 pb-4">
          <div className="flex items-center gap-3">
            {entry?.imageUrl && (
              <img
                src={entry.imageUrl}
                className="size-14 shrink-0 rounded-lg border border-border object-contain"
                alt=""
              />
            )}
            <div className="min-w-0">
              <SheetTitle className="truncate">{name}</SheetTitle>
              {entry?.brand && (
                <p className="truncate text-sm text-muted-foreground">
                  {entry.brand}
                </p>
              )}
            </div>
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-4">
          {entry && !entry.productId && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium">Bezeichnung</label>
              <Input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium">Menge</label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() =>
                  setQuantity((q) => (q === 1 ? null : (q ?? 1) - 1))
                }
                aria-label="Menge verringern"
              >
                <Minus aria-hidden />
              </Button>
              <span className="w-8 text-center tabular-nums text-sm">
                {quantity ?? "−"}
              </span>
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => setQuantity((q) => (q ?? 0) + 1)}
                aria-label="Menge erhöhen"
              >
                <Plus aria-hidden />
              </Button>
              <Input
                placeholder="Stk, g, …"
                className="flex-1"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium">Notiz (optional)</label>
            <textarea
              rows={2}
              className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted outline-none focus:border-border-strong"
              placeholder="z.B. Vollmilch, Bio"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <Button className="w-full" onClick={handleSave} disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            Speichern
          </Button>

          {entry?.boughtAt !== null && entry?.boughtAt !== undefined && (
            <Link
              href={`/add?fromShopping=${entry.id}`}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-fg hover:bg-sage-400"
            >
              <Package className="size-4" aria-hidden /> In den Vorrat
            </Link>
          )}

          <div className="border-t border-border" />

          <button
            type="button"
            className="flex items-center gap-2 text-sm text-danger hover:text-danger/80"
            onClick={handleDelete}
            disabled={pending}
          >
            <Trash2 className="size-4" aria-hidden /> Von Liste entfernen
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
