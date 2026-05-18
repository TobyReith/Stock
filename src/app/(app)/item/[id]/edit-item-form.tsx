"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2,
  Package,
  CheckCircle2,
  Snowflake,
  Trash2,
  ShoppingCart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import type { UpdateItemInput, ItemCategoryType } from "@/lib/schemas/items";
import type { CategoryDisplay } from "@/lib/schemas/categories";
import type { StorageLocationDisplay } from "@/lib/schemas/storage-locations";
import { DeleteItemButton } from "./delete-item-button";

export type DetailItem = {
  id: string;
  quantity: number;
  unit: string | null;
  bestBefore: string;
  location: string;
  itemCategory: ItemCategoryType;
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
  addedAt: string;
};

const ITEM_CATEGORIES = [
  { key: "food" as const, emoji: "🥦", label: "Essen" },
  { key: "hygiene" as const, emoji: "🧴", label: "Hygiene" },
  { key: "medicine" as const, emoji: "💊", label: "Medizin" },
  { key: "other" as const, emoji: "📦", label: "Sonstiges" },
];

const UNIT_OPTIONS = ["Stk", "L", "ml", "g", "kg", "Pkg", "Bd", "Becher"];

function formatAddedAt(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
  if (days === 0) return "heute";
  if (days === 1) return "gestern";
  return `vor ${days} Tagen`;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border last:border-b-0">
      <span className="text-[13px] text-muted font-medium shrink-0 mr-4 w-28">{label}</span>
      <div className="flex-1 flex justify-end">{children}</div>
    </div>
  );
}

const inlineInputClass =
  "bg-transparent text-right text-sm text-foreground placeholder:text-muted outline-none border-none w-full focus-visible:underline focus-visible:decoration-border-strong focus-visible:underline-offset-2";

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
  const [customCategory, setCustomCategory] = useState<string>(
    item.customCategory ?? item.category ?? "",
  );
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [unit, setUnit] = useState(item.unit ?? "");
  const [bestBefore, setBestBefore] = useState(item.bestBefore);
  const [location, setLocation] = useState(item.location);
  const [note, setNote] = useState(item.note ?? "");
  const [frozenAt, setFrozenAt] = useState<string | null>(item.frozenAt);
  const [itemCategory, setItemCategory] = useState<ItemCategoryType>(item.itemCategory);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isAddingShopping, startShoppingTransition] = useTransition();

  const filteredStorageLocations = useMemo(
    () =>
      storageLocations.filter(
        (l) =>
          l.categories.length === 0 ||
          l.slug === "other" ||
          l.categories.includes(itemCategory),
      ),
    [storageLocations, itemCategory],
  );

  function handleCategoryChange(key: ItemCategoryType) {
    setItemCategory(key);
    if (customCategory && !categories.some((c) => c.slug === customCategory && c.parentCategory === key)) {
      setCustomCategory("");
    }
    const validLocs = storageLocations.filter(
      (l) => l.categories.length === 0 || l.slug === "other" || l.categories.includes(key),
    );
    if (!validLocs.find((l) => l.slug === location)) {
      setLocation(validLocs[0]?.slug ?? "other");
    }
  }

  // Only POST if something changed — keeps update calls cheap.
  function buildPatch(): UpdateItemInput | null {
    const patch: UpdateItemInput = { id: item.id };
    let changed = false;

    if (itemCategory !== item.itemCategory) {
      patch.itemCategory = itemCategory;
      changed = true;
    }
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
    const nextCategory = customCategory || null;
    const storedCategory = item.customCategory ?? null;
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
              brand: item.brand ?? undefined,
              imageUrl: item.imageUrl ?? undefined,
              category: item.category ?? undefined,
              itemCategory: item.itemCategory,
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

  function handleAddToShopping() {
    const displayName = (customName.trim() || item.productName).trim();
    const qty = Number(quantity);
    startShoppingTransition(async () => {
      const res = await addShoppingItem({
        productId: item.productId ?? undefined,
        customName: displayName || undefined,
        brand: (customBrand.trim() || item.brand) ?? undefined,
        imageUrl: item.imageUrl ?? undefined,
        category: (customCategory || item.category) ?? undefined,
        itemCategory: itemCategory,
        quantity: qty > 0 ? qty : undefined,
        unit: (unit.trim() || item.unit) ?? undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Zur Einkaufsliste hinzugefügt", {
        duration: 5000,
        action: {
          label: "Ansehen",
          onClick: () => { router.push("/shopping"); },
        },
      });
    });
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col">

      {/* 1. Produktkachel */}
      <div className="flex items-center gap-4 rounded-xl bg-surface border border-border p-4 mb-4">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-raised">
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt=""
              className="max-h-full max-w-full object-contain p-0.5"
            />
          ) : (
            <Package className="size-7 text-muted" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">
            {item.customName ?? item.productName}
          </p>
          {(item.customBrand ?? item.brand) && (
            <p className="truncate text-sm text-muted">{item.customBrand ?? item.brand}</p>
          )}
          {item.barcode && (
            <p className="mt-0.5 font-mono text-xs text-muted">
              Barcode {item.barcode}
            </p>
          )}
        </div>
      </div>

      {/* 2. CTA-Block */}
      <div className="grid grid-cols-2 gap-2 mb-6">
        <Button
          type="button"
          size="lg"
          onClick={handleConsume}
          disabled={isPending}
          className="rounded-lg"
        >
          <CheckCircle2 aria-hidden /> Verbraucht
        </Button>
        <Button
          type="button"
          size="lg"
          onClick={handleDiscard}
          disabled={isPending}
          className="rounded-lg bg-danger-subtle text-danger hover:bg-danger-subtle/80 border-transparent"
          variant="outline"
        >
          <Trash2 aria-hidden /> Entsorgt
        </Button>
        {frozenAt ? (
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={handleUnfreeze}
            disabled={isPending}
            className="rounded-lg"
          >
            <Snowflake aria-hidden /> Auftauen
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={handleFreeze}
            disabled={isPending}
            className="rounded-lg"
          >
            <Snowflake aria-hidden /> Einfrieren
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          size="lg"
          onClick={handleAddToShopping}
          disabled={isAddingShopping}
          className="rounded-lg"
        >
          <ShoppingCart aria-hidden /> Nachkaufen
        </Button>
      </div>

      {/* 3. Details-Tabelle */}
      <div className="rounded-xl bg-surface border border-border overflow-hidden mb-4">

        <DetailRow label="Name">
          <input
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder={item.productName}
            className={inlineInputClass}
          />
        </DetailRow>

        <DetailRow label="Marke">
          <input
            value={customBrand}
            onChange={(e) => setCustomBrand(e.target.value)}
            placeholder={item.brand ?? "z.B. Rewe Bio"}
            className={inlineInputClass}
          />
        </DetailRow>

        <DetailRow label="Menge">
          <div className="flex items-center gap-2 justify-end">
            <input
              type="number"
              min="0.1"
              step="0.1"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
              className={cn(inlineInputClass, "w-16")}
            />
            <select
              value={UNIT_OPTIONS.includes(unit) ? unit : ""}
              onChange={(e) => setUnit(e.target.value)}
              className="bg-transparent text-right text-sm text-foreground outline-none border-none appearance-none cursor-pointer"
            >
              <option value="">—</option>
              {!UNIT_OPTIONS.includes(unit) && unit && (
                <option value={unit}>{unit}</option>
              )}
              {UNIT_OPTIONS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
        </DetailRow>

        <DetailRow label="MHD">
          <input
            type="date"
            value={bestBefore}
            onChange={(e) => setBestBefore(e.target.value)}
            required
            className={cn(inlineInputClass, "w-auto")}
          />
        </DetailRow>

        <DetailRow label="Lagerort">
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="bg-transparent text-right text-sm text-foreground outline-none border-none appearance-none cursor-pointer"
          >
            {filteredStorageLocations.map(({ slug, name, icon }) => (
              <option key={slug} value={slug}>{icon} {name}</option>
            ))}
          </select>
        </DetailRow>

        <DetailRow label="Kategorie">
          <select
            value={customCategory}
            onChange={(e) => setCustomCategory(e.target.value)}
            className="bg-transparent text-right text-sm text-foreground outline-none border-none appearance-none cursor-pointer"
          >
            <option value="">— keine —</option>
            {categories.filter((c) => c.parentCategory === itemCategory).map((c) => (
              <option key={c.slug} value={c.slug}>{c.icon} {c.name}</option>
            ))}
          </select>
        </DetailRow>

        <DetailRow label="Art">
          <select
            value={itemCategory}
            onChange={(e) => handleCategoryChange(e.target.value as ItemCategoryType)}
            className="bg-transparent text-right text-sm text-foreground outline-none border-none appearance-none cursor-pointer"
          >
            {ITEM_CATEGORIES.map(({ key, emoji, label }) => (
              <option key={key} value={key}>{emoji} {label}</option>
            ))}
          </select>
        </DetailRow>

        {frozenAt && (
          <DetailRow label="Eingefroren am">
            <input
              type="date"
              value={frozenAt}
              onChange={(e) => void handleFrozenAtChange(e.target.value)}
              aria-label="Einfrier-Datum"
              className={cn(inlineInputClass, "w-auto")}
            />
          </DetailRow>
        )}

        <DetailRow label="Hinzugefügt">
          <span className="text-sm text-muted">{formatAddedAt(item.addedAt)}</span>
        </DetailRow>
      </div>

      {/* 4. Notiz */}
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder:text-muted outline-none focus:border-border-strong mb-4"
        placeholder="Notiz (optional) — z.B. angebrochen, für Pizza"
      />

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger mb-4"
        >
          {error}
        </div>
      )}

      {/* 5. Speichern */}
      <Button type="submit" size="lg" className="w-full rounded-lg" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden /> …
          </>
        ) : (
          "Speichern"
        )}
      </Button>

      {/* 6. Artikel löschen */}
      <div className="flex justify-center mt-4 mb-2">
        <DeleteItemButton
          itemId={item.id}
          itemName={item.customName ?? item.productName}
          disabled={isPending}
        />
      </div>

    </form>
  );
}
