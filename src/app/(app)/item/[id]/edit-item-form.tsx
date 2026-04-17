"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2,
  Refrigerator,
  Package,
  Snowflake,
  Archive,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { consumeItem, discardItem, updateItem } from "@/lib/actions/items";
import type { UpdateItemInput } from "@/lib/schemas/items";

/**
 * Edit form + Consume/Discard actions for a single item.
 *
 * Only the per-item fields are editable — product name/brand/image live
 * on the global `products` cache and are frozen by design (ADR-0002).
 *
 * Actions wrap all three server actions (`updateItem`, `consumeItem`,
 * `discardItem`) in a single `useTransition` so the buttons share one
 * pending state. All three redirect back to the list on success.
 */

export type DetailItem = {
  id: string;
  quantity: number;
  unit: string | null;
  bestBefore: string;
  location: "fridge" | "pantry" | "freezer" | "other";
  customName: string | null;
  note: string | null;
  productName: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  barcode: string | null;
};

const LOCATIONS: {
  value: DetailItem["location"];
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "fridge", label: "Kühlschrank", icon: Refrigerator },
  { value: "pantry", label: "Vorrat", icon: Package },
  { value: "freezer", label: "Gefrierer", icon: Snowflake },
  { value: "other", label: "Sonstiges", icon: Archive },
];

export function EditItemForm({ item }: { item: DetailItem }) {
  const router = useRouter();
  const [customName, setCustomName] = useState(item.customName ?? "");
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [unit, setUnit] = useState(item.unit ?? "");
  const [bestBefore, setBestBefore] = useState(item.bestBefore);
  const [location, setLocation] = useState(item.location);
  const [note, setNote] = useState(item.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // "Dirty" check — we only POST if something changed. Keeps update
  // calls cheap and avoids unnecessary revalidations.
  function buildPatch(): UpdateItemInput | null {
    const patch: UpdateItemInput = { id: item.id };
    let changed = false;

    const nextCustom = customName.trim() || null;
    if (nextCustom !== (item.customName ?? null)) {
      patch.customName = nextCustom;
      changed = true;
    }
    const qty = Number(quantity);
    if (Number.isFinite(qty) && qty > 0 && qty !== item.quantity) {
      patch.quantity = qty;
      changed = true;
    }
    const nextUnit = unit.trim() || null;
    if (nextUnit !== (item.unit ?? null)) {
      patch.unit = nextUnit;
      changed = true;
    }
    if (bestBefore !== item.bestBefore) {
      patch.bestBefore = bestBefore;
      changed = true;
    }
    if (location !== item.location) {
      patch.location = location;
      changed = true;
    }
    const nextNote = note.trim() || null;
    if (nextNote !== (item.note ?? null)) {
      patch.note = nextNote;
      changed = true;
    }

    return changed ? patch : null;
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const patch = buildPatch();
    if (!patch) {
      toast.info("Keine Änderungen");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await updateItem(patch);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Gespeichert");
      router.push("/");
    });
  }

  function handleConsume() {
    setError(null);
    startTransition(async () => {
      const res = await consumeItem(item.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Als verbraucht markiert");
      router.push("/");
    });
  }

  function handleDiscard() {
    if (!confirm("Als entsorgt markieren? Zählt in die Verschwendungs-Statistik.")) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await discardItem(item.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Als entsorgt markiert");
      router.push("/");
    });
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-5">
      {/* Product summary — read-only, like in the Add-Flow. */}
      <div className="flex items-start gap-3 rounded-lg border p-3">
        <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded border bg-muted">
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt=""
              className="size-full object-contain"
            />
          ) : (
            <Package className="size-6 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{item.productName}</p>
          {item.brand && (
            <p className="truncate text-sm text-muted-foreground">{item.brand}</p>
          )}
          {item.barcode && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Barcode {item.barcode}
            </p>
          )}
        </div>
      </div>

      <FieldRow>
        <Label htmlFor="custom-name">
          Eigener Name <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="custom-name"
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          placeholder={item.productName}
        />
      </FieldRow>

      <div className="grid grid-cols-[1fr_1fr] gap-3">
        <FieldRow>
          <Label htmlFor="quantity">Menge</Label>
          <Input
            id="quantity"
            type="number"
            min="0.1"
            step="0.1"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
        </FieldRow>
        <FieldRow>
          <Label htmlFor="unit">
            Einheit <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="z.B. Stück, g"
          />
        </FieldRow>
      </div>

      <FieldRow>
        <Label htmlFor="best-before">Mindesthaltbarkeitsdatum</Label>
        <Input
          id="best-before"
          type="date"
          value={bestBefore}
          onChange={(e) => setBestBefore(e.target.value)}
          required
        />
      </FieldRow>

      <FieldRow>
        <Label>Lagerort</Label>
        <div className="grid grid-cols-4 gap-1 rounded-lg border p-1">
          {LOCATIONS.map(({ value, label, icon: Icon }) => {
            const active = location === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setLocation(value)}
                aria-pressed={active}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-md py-2 text-xs transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </button>
            );
          })}
        </div>
      </FieldRow>

      <FieldRow>
        <Label htmlFor="note">
          Notiz <span className="text-muted-foreground">(optional)</span>
        </Label>
        <textarea
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          placeholder="z.B. angebrochen, für Pizza"
        />
      </FieldRow>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <Button type="submit" className="flex-1" size="lg" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="animate-spin" aria-hidden /> …
            </>
          ) : (
            "Speichern"
          )}
        </Button>
      </div>

      {/* Destructive / terminal actions at the bottom, separated from save. */}
      <div className="mt-2 flex flex-col gap-2 border-t pt-4">
        <p className="text-xs text-muted-foreground">
          Artikel abschließen:
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={handleConsume}
            disabled={isPending}
          >
            <CheckCircle2 aria-hidden /> Verbraucht
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={handleDiscard}
            disabled={isPending}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 aria-hidden /> Entsorgt
          </Button>
        </div>
      </div>
    </form>
  );
}

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-1.5">{children}</div>;
}
