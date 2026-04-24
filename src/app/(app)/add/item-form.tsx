"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { addItem } from "@/lib/actions/items";
import type { AddItemInput } from "@/lib/schemas/items";
import {
  defaultBestBeforeDate,
  getCategory,
} from "@/lib/constants/categories";
import type { CategoryDisplay } from "@/lib/schemas/categories";
import type { StorageLocationDisplay } from "@/lib/schemas/storage-locations";
import { MhdCapture } from "./mhd-capture";
import {
  ProductAutocomplete,
  type ProductSearchResult,
} from "./product-autocomplete";

/**
 * The actual "add item" form.
 *
 * Three seed shapes, all collapsed into one form:
 *   - `known`   — product already in our cache or freshly resolved via OFF.
 *                 Name/brand/image/category are fixed; user only fills
 *                 item-specific fields (alias, qty, MHD, location, note).
 *   - `off`     — same as `known` but productId doesn't exist yet; the
 *                 server action will create the product row on submit.
 *   - `unknown` — barcode was not found anywhere; user supplies product
 *                 name + category manually, barcode is preserved.
 *   - `manual`  — no barcode at all; like `unknown` minus the barcode.
 *   - `vision`  — product identified via photo; name/brand/image/category
 *                 are fixed like `off`, but there is no barcode.
 *
 * The MHD field is prefilled from the category default and can be
 * replaced either manually or via an OCR photo (see `MhdCapture`).
 */

export type FormSeed =
  | {
      kind: "known";
      productId: string;
      productName: string;
      brand: string | null;
      imageUrl: string | null;
      category: string;
      barcode: string | null;
    }
  | {
      kind: "off";
      productName: string;
      brand: string | null;
      imageUrl: string | null;
      category: string;
      barcode: string;
    }
  | {
      kind: "unknown";
      barcode: string;
    }
  | {
      kind: "manual";
    }
  | {
      kind: "vision";
      productName: string;
      brand: string | null;
      imageUrl: string | null;
      category: string;
    };

/**
 * Optional field pre-fill. Used by the Einkaufsliste → Vorrat handover,
 * which knows the user's preferred customName / quantity / unit for the
 * item they're about to move — we carry those values across rather than
 * forcing the user to retype them.
 */
export type ItemFormPrefill = {
  customName?: string;
  quantity?: number;
  unit?: string;
};

type Props = {
  seed: FormSeed;
  prefill?: ItemFormPrefill;
  categories: CategoryDisplay[];
  storageLocations: StorageLocationDisplay[];
  onCancel: () => void;
  onSuccess: () => void;
};

export function ItemForm({ seed, prefill, categories, storageLocations, onCancel, onSuccess }: Props) {
  const needsProductFields = seed.kind === "unknown" || seed.kind === "manual";
  const seedProduct = "productName" in seed ? seed : null;
  const seedCategory: string =
    "category" in seed ? seed.category : "other";

  // We manage form state with useState — the shape is small enough that
  // react-hook-form is overkill and the controlled inputs play nicely with
  // the MHD-capture callback that needs to update a single field.
  //
  // When `prefill` is set (e.g. Einkaufsliste → Vorrat), its values seed
  // the initial state; the user still edits normally from there. We treat
  // prefill as a **mount-time hint** rather than a reactive prop — React
  // state would otherwise desync if the caller swapped prefills mid-form.
  const [productName, setProductName] = useState(
    seedProduct?.productName ?? prefill?.customName ?? "",
  );
  const [category, setCategory] = useState<string>(seedCategory);
  const [customName, setCustomName] = useState(
    // Only pre-fill `customName` when we *have* a product — otherwise the
    // shopping-list text already lives in `productName` above and dupli-
    // cating it as an alias would create a confusing "Butter / Butter"
    // rendering on the list.
    seedProduct && prefill?.customName ? prefill.customName : "",
  );
  const [quantity, setQuantity] = useState(
    prefill?.quantity != null && prefill.quantity > 0
      ? String(prefill.quantity)
      : "1",
  );
  const [unit, setUnit] = useState(prefill?.unit ?? "");
  const [bestBefore, setBestBefore] = useState(() =>
    defaultBestBeforeDate(seedCategory),
  );
  const [mhdSource, setMhdSource] = useState<"default" | "ocr" | "manual">(
    "default",
  );
  const [mhdRaw, setMhdRaw] = useState<string | null>(null);
  const [location, setLocation] = useState<string>(
    resolveDefaultLocation(seedCategory, storageLocations),
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Extra metadata captured when the user picks from autocomplete.
  // Used to enrich the addItem call the same way the "off" seed path does.
  const [offBrand, setOffBrand] = useState<string | null>(null);
  const [offImageUrl, setOffImageUrl] = useState<string | null>(null);
  const [offBarcode, setOffBarcode] = useState<string | null>(null);

  // When the user changes the category on an unknown/manual entry, bump
  // the default MHD + location — but only if they haven't customized them.
  function handleCategoryChange(next: string) {
    setCategory(next);
    if (mhdSource === "default") {
      setBestBefore(defaultBestBeforeDate(next));
    }
    setLocation(resolveDefaultLocation(next, storageLocations));
  }

  function handleAutocompleteSelect(result: ProductSearchResult) {
    setOffBrand(result.brand);
    setOffImageUrl(result.imageUrl);
    setOffBarcode(result.barcode);
    handleCategoryChange(result.category);
    // Pre-fill unit from the OFF quantity string ("500 g" → "g") if the
    // user hasn't set one yet.
    const parsedUnit = parseUnit(result.quantity);
    if (!unit && parsedUnit) setUnit(parsedUnit);
  }

  const canSubmit = useMemo(() => {
    const q = Number(quantity);
    if (!(q > 0)) return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bestBefore)) return false;
    if (needsProductFields && productName.trim().length === 0) return false;
    return true;
  }, [quantity, bestBefore, needsProductFields, productName]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);

    const barcode = "barcode" in seed ? seed.barcode : offBarcode;
    const input: AddItemInput = {
      productId: seed.kind === "known" ? seed.productId : undefined,
      barcode: barcode ?? undefined,
      productName: seedProduct?.productName ?? productName.trim(),
      brand: seedProduct?.brand ?? offBrand ?? null,
      imageUrl: seedProduct?.imageUrl ?? offImageUrl ?? null,
      category,
      customName: customName.trim() || undefined,
      quantity: Number(quantity),
      unit: unit.trim() || undefined,
      bestBefore,
      location,
      note: note.trim() || undefined,
    };

    startTransition(async () => {
      const res = await addItem(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSuccess();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Product preview (known path) — read-only summary so user knows
          what they're adding and where to tweak it (customName). */}
      {seedProduct && (
        <div className="flex items-start gap-3 rounded-lg border p-3">
          {seedProduct.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={seedProduct.imageUrl}
              alt=""
              className="size-16 shrink-0 rounded border object-contain"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{seedProduct.productName}</p>
            {seedProduct.brand && (
              <p className="truncate text-sm text-muted-foreground">
                {seedProduct.brand}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {categories.find((c) => c.slug === seedProduct.category)?.name ??
                getCategory(seedProduct.category).label}
            </p>
          </div>
        </div>
      )}

      {/* Product fields (unknown / manual path) */}
      {needsProductFields && (
        <>
          <FieldRow>
            <Label htmlFor="product-name">Produktname</Label>
            <ProductAutocomplete
              id="product-name"
              value={productName}
              onChange={(v) => {
                setProductName(v);
                // Clear cached OFF data when the user edits freely.
                if (offBarcode) {
                  setOffBrand(null);
                  setOffImageUrl(null);
                  setOffBarcode(null);
                }
              }}
              onSelect={handleAutocompleteSelect}
              placeholder="z.B. Haferflocken"
              autoFocus
              required
            />
          </FieldRow>
          <FieldRow>
            <Label htmlFor="category">Kategorie</Label>
            <select
              id="category"
              value={category}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </FieldRow>
        </>
      )}

      {/* Alias — optional short name for the shelf ("Opas Honig"). */}
      <FieldRow>
        <Label htmlFor="custom-name">
          Eigener Name <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="custom-name"
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          placeholder={seedProduct?.productName ?? "z.B. Opas Honig"}
        />
      </FieldRow>

      {/* Quantity + unit share a row */}
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
            placeholder="z.B. Stück, g, L"
          />
        </FieldRow>
      </div>

      {/* MHD: date input + OCR trigger. Default comes from category. */}
      <FieldRow>
        <div className="flex items-center justify-between">
          <Label htmlFor="best-before">Mindesthaltbarkeitsdatum</Label>
          <MhdCapture
            onDate={(iso, raw) => {
              setBestBefore(iso);
              setMhdSource("ocr");
              setMhdRaw(raw);
            }}
          />
        </div>
        <Input
          id="best-before"
          type="date"
          value={bestBefore}
          onChange={(e) => {
            setBestBefore(e.target.value);
            setMhdSource("manual");
            setMhdRaw(null);
          }}
          required
        />
        <p className="text-xs text-muted-foreground">
          {mhdSource === "default" &&
            `Standard für ${categories.find((c) => c.slug === category)?.name ?? getCategory(category).label}. "MHD scannen" für Foto-Erkennung.`}
          {mhdSource === "ocr" && mhdRaw && `Erkannt: "${mhdRaw}"`}
          {mhdSource === "manual" && "Manuell eingegeben."}
        </p>
      </FieldRow>

      {/* Location segmented control */}
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
        <Button type="submit" className="flex-1" size="lg" disabled={!canSubmit || isPending}>
          {isPending ? (
            <>
              <Loader2 className="animate-spin" aria-hidden /> Wird gespeichert…
            </>
          ) : (
            "Hinzufügen"
          )}
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={onCancel} disabled={isPending}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

function resolveDefaultLocation(
  category: string,
  storageLocations: StorageLocationDisplay[],
): string {
  const defaultSlug = getCategory(category).defaultLocation;
  const found = storageLocations.find((l) => l.slug === defaultSlug);
  return found?.slug ?? storageLocations[0]?.slug ?? "other";
}

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-1.5">{children}</div>;
}

/** Extract a unit abbreviation from an OFF quantity string like "500 g" or "1,5 L". */
function parseUnit(quantity: string | null): string | null {
  if (!quantity) return null;
  const m = quantity.match(/\b(g|kg|ml|l|cl|dl|mg)\b/i);
  return m ? m[1]!.toLowerCase() : null;
}
