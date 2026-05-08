"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2,
  Package,
  CheckCircle2,
  Snowflake,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  consumeItem,
  discardItem,
  freezeItem,
  unmarkItem,
  unfreezeItem,
  updateItem,
} from "@/lib/actions/items";
import { addShoppingItem } from "@/lib/actions/shopping";
import type { UpdateItemInput } from "@/lib/schemas/items";
import type { CategoryDisplay } from "@/lib/schemas/categories";
import type { StorageLocationDisplay } from "@/lib/schemas/storage-locations";
import { FieldRow } from "@/components/ui/form-field";

/**
 * Edit form + Consume/Discard actions for a single item.
 *
 * The product cache is global and admin-only (ADR-0002), so we expose
 * per-item *overrides* rather than editing `products` directly:
 * `customName`, `customBrand`, `customCategory`. Null means "fall
 * through to the product value". This PR (Phase 2.4) added the brand &
 * category overrides — the name override already existed.
 */

export type DetailItem = {
  id: string;
  quantity: number;
  unit: string | null;
  bestBefore: string;
  location: string;
  customName: string | null;
  customBrand: string | null;
  customCategory: string | null;
  note: string | null;
  productId: string | null;
  productName: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  barcode: string | null;
  frozenAt: string | null;
};

export function EditItemForm({
  item,
  categories,
  storageLocations,
}: {
  item: DetailItem;
  categories: CategoryDisplay[];
  storageLocations: StorageLocationDisplay[];
}) {
  const router = useRouter();
  const [customName, setCustomName] = useState(item.customName ?? "");
  const [customBrand, setCustomBrand] = useState(item.customBrand ?? "");
  // `customCategory` defaults to the product's category when no override
  // is set — that way a user who opens the dropdown to correct it sees
  // the current effective value, not a confusing empty state.
  const [customCategory, setCustomCategory] = useState<string>(
    item.customCategory ?? item.category ?? "",
  );
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [unit, setUnit] = useState(item.unit ?? "");
  const [bestBefore, setBestBefore] = useState(item.bestBefore);
  const [location, setLocation] = useState(item.location);
  const [note, setNote] = useState(item.note ?? "");
  const [frozenAt, setFrozenAt] = useState<string | null>(item.frozenAt);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /**
   * Effective category the user currently sees. Used to decide whether
   * the select value represents an override vs. the cache value — the
   * dirty-check compares against `item.customCategory`, not the
   * effective one, so changing FROM "empty override, cache='produce'"
   * TO "override='produce'" is *not* a write.
   */
  const effectiveCategory = item.customCategory ?? item.category;

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
    const nextBrand = customBrand.trim() || null;
    if (nextBrand !== (item.customBrand ?? null)) {
      patch.customBrand = nextBrand;
      changed = true;
    }
    // `""` from the select means "no override"; the zod schema accepts
    // null to unset the column. Only write when the user explicitly
    // picked something different from the stored override.
    const nextCategory = customCategory || null;
    const storedCategory = item.customCategory ?? null;
    // Treat "override matches cache" the same as "no override" — the
    // user hasn't actually personalized the row. This collapses one
    // weird state and keeps `custom_category` sparse in the DB.
    const collapsedNext =
      nextCategory && nextCategory === item.category ? null : nextCategory;
    if (collapsedNext !== storedCategory) {
      patch.customCategory = collapsedNext;
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

  /**
   * Shared post-close handler: push the user to the list, then show a
   * toast with two actions — "Rückgängig" (primary, wired to
   * `unmarkItem`) and "Nachkaufen" (secondary, adds the same product to
   * the shopping list). The toast lives in the root `<Toaster />` so it
   * survives the navigation.
   *
   * We pop the toast *after* `router.push` intentionally — the toast
   * is for the new page context, not the one we're leaving.
   *
   * Sonner renders `action` and `cancel` as a two-button row. The label
   * "Nachkaufen" reads as a positive action even though it lives in the
   * `cancel` slot; the slot name is internal styling, not user-visible.
   */
  function showUndoToast(message: string) {
    toast.success(message, {
      duration: 5000,
      action: {
        label: "Rückgängig",
        onClick: () => {
          void (async () => {
            const res = await unmarkItem(item.id);
            if (!res.ok) {
              toast.error(res.error);
              return;
            }
            // Re-render the list so the item pops back into view. The
            // server action already revalidated "/" and "/stats", so
            // the refresh picks up the restored row.
            router.refresh();
            toast.success("Wieder im Vorrat");
          })();
        },
      },
      cancel: {
        label: "Nachkaufen",
        onClick: () => {
          void (async () => {
            const displayName = (item.customName ?? item.productName).trim();
            const res = await addShoppingItem({
              productId: item.productId ?? undefined,
              customName: displayName || undefined,
              quantity: item.quantity > 0 ? item.quantity : undefined,
              unit: item.unit ?? undefined,
            });
            if (!res.ok) {
              toast.error(res.error);
              return;
            }
            toast.success("Zur Einkaufsliste hinzugefügt");
          })();
        },
      },
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
      router.push("/");
      showUndoToast("Als verbraucht markiert");
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
      router.push("/");
      showUndoToast("Als entsorgt markiert");
    });
  }

  function handleFreeze() {
    const origBestBefore = bestBefore;
    const origLocation = location;
    setError(null);
    startTransition(async () => {
      const res = await freezeItem(item.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setFrozenAt(new Date().toISOString().slice(0, 10));
      toast.success("Eingefroren · MHD aktualisiert", {
        duration: 5000,
        action: {
          label: "Rückgängig",
          onClick: () => {
            void (async () => {
              const r = await unfreezeItem(item.id, origBestBefore, origLocation);
              if (!r.ok) { toast.error(r.error); return; }
              setFrozenAt(null);
              setBestBefore(origBestBefore);
              setLocation(origLocation);
              toast.success("Einfrieren rückgängig gemacht");
            })();
          },
        },
      });
      // Reload so the MHD field shows the new value.
      router.refresh();
    });
  }

  function handleUnfreeze() {
    setError(null);
    startTransition(async () => {
      const res = await unfreezeItem(item.id, bestBefore, location);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setFrozenAt(null);
      toast.success("Aufgetaut");
    });
  }

  async function handleFrozenAtChange(newDate: string) {
    setFrozenAt(newDate);
    const res = await updateItem({ id: item.id, frozenAt: newDate || null });
    if (!res.ok) toast.error(res.error);
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-5">
      {/* Product summary — read-only, like in the Add-Flow. */}
      <div className="flex items-start gap-3 rounded-lg border p-3">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted">
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt=""
              className="max-h-full max-w-full object-contain p-0.5"
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

      <FieldRow>
        <Label htmlFor="custom-brand">
          Eigene Marke{" "}
          <span className="text-muted-foreground">(überschreibt Datenbank)</span>
        </Label>
        <Input
          id="custom-brand"
          value={customBrand}
          onChange={(e) => setCustomBrand(e.target.value)}
          placeholder={item.brand ?? "z.B. Rewe Bio"}
        />
      </FieldRow>

      <FieldRow>
        <Label htmlFor="custom-category">
          Eigene Kategorie{" "}
          <span className="text-muted-foreground">(überschreibt Datenbank)</span>
        </Label>
        <select
          id="custom-category"
          value={customCategory}
          onChange={(e) => setCustomCategory(e.target.value)}
          className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">— keine Auswahl —</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
        {effectiveCategory && effectiveCategory !== customCategory && (
          <p className="text-xs text-muted-foreground">
            Aktuell:{" "}
            {categories.find((c) => c.slug === effectiveCategory)?.name ??
              effectiveCategory}
          </p>
        )}
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
        <div className="grid grid-cols-3 gap-1 rounded-lg border p-1">
          {storageLocations.map(({ slug, name, icon }) => {
            const active = location === slug;
            return (
              <button
                key={slug}
                type="button"
                onClick={() => setLocation(slug)}
                aria-pressed={active}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-md py-2 text-xs transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span className="text-base leading-none" aria-hidden>{icon}</span>
                {name}
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

      {/* Freeze action — separate from the terminal actions. */}
      <div className="mt-2 flex flex-col gap-2 border-t pt-4">
        <p className="text-xs text-muted-foreground">Lagerung:</p>
        {frozenAt ? (
          <div className="flex items-center gap-2">
            <Snowflake className="size-4 shrink-0 text-sky-500" aria-hidden />
            <span className="text-sm text-muted-foreground">Eingefroren am</span>
            <Input
              type="date"
              value={frozenAt}
              onChange={(e) => void handleFrozenAtChange(e.target.value)}
              className="h-8 w-auto flex-1 text-sm"
              aria-label="Einfrier-Datum"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleUnfreeze}
              disabled={isPending}
            >
              Auftauen
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={handleFreeze}
            disabled={isPending}
            className="w-full text-sky-600 hover:text-sky-600"
          >
            <Snowflake aria-hidden /> Einfrieren
          </Button>
        )}
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
