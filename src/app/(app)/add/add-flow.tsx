"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, CheckCircle2, Loader2, PackageSearch, Pencil, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { lookupBarcode } from "@/lib/actions/items";
import { markShoppingItemBought } from "@/lib/actions/shopping";
import type { CategoryDisplay } from "@/lib/schemas/categories";
import type { StorageLocationDisplay } from "@/lib/schemas/storage-locations";
import type { ProductCandidate } from "@/lib/vision/types";
import { ItemForm, type FormSeed, type ItemFormPrefill } from "./item-form";

/**
 * Lazy-load the unified live scanner.
 *
 * Pulls in `@zxing/browser` + `@zxing/library` (~200 KB gzipped) and the
 * camera-engine detector — none of that belongs in the initial bundle.
 * `ssr: false` because it reaches for `navigator.mediaDevices` on render.
 * The loading fallback matches the camera viewport shape to prevent reflow.
 */
const LiveScanner = dynamic(
  () => import("./live-scanner").then((m) => m.LiveScanner),
  {
    ssr: false,
    loading: () => (
      <div
        className="aspect-[4/3] w-full animate-pulse rounded-lg border border-border bg-surface-raised"
        aria-hidden
      />
    ),
  },
);

/**
 * Top-level state machine for the Add-Flow page.
 *
 *   scanner ─scan/manual─▶ lookup ─known──▶ preview ─▶ form ─submit─▶ done
 *        └─"ohne Barcode"────────────────────────────▶ form (manual)
 *   lookup ─unknown─▶ preview ─▶ form (unknown)
 *
 * We keep the preview step between lookup and form so the user can
 * confirm "yes, that's the right product" before committing. For the
 * manual-no-barcode path there's nothing to preview — skip straight to
 * the form.
 */

type LookupResult = Awaited<ReturnType<typeof lookupBarcode>>;

type Stage =
  | { kind: "scan" }
  | { kind: "manual-barcode" }
  | { kind: "validating-barcode"; barcode: string }
  | { kind: "looking-up"; barcode: string }
  | { kind: "lookup-error"; message: string; barcode: string }
  | { kind: "preview"; barcode: string; result: LookupResult }
  | { kind: "photo-analyzing" }
  | { kind: "photo-candidates"; candidates: ProductCandidate[] }
  | { kind: "form"; seed: FormSeed };

/**
 * Bootstrap payload for the "Einkaufsliste → Vorrat" handover.
 *
 * When this prop is set, the flow skips scanner/preview and drops the
 * user straight into the form pre-filled from the shopping-list row.
 * On a successful submit we call `markShoppingItemBought` so the
 * source row closes out of the "offen" bucket without a second action.
 */
export type AddFlowInitial = {
  seed: FormSeed;
  prefill?: ItemFormPrefill;
  shoppingListItemId: string;
};

export function AddFlow({
  initial,
  initialItemCategory = "food",
  categories,
  storageLocations,
}: {
  initial?: AddFlowInitial;
  initialItemCategory?: "food" | "hygiene" | "medicine" | "other";
  categories: CategoryDisplay[];
  storageLocations: StorageLocationDisplay[];
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>(
    initial ? { kind: "form", seed: initial.seed } : { kind: "scan" },
  );
  const [, startTransition] = useTransition();
  const failedBarcodesRef = useRef<Set<string>>(new Set());
  const pendingBarcodeRef = useRef<string | null>(null);
  const lastCandidatesRef = useRef<ProductCandidate[]>([]);
  const pendingNavRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [photoHintMode, setPhotoHintMode] = useState(false);
  const [slowHint, setSlowHint] = useState(false);

  useEffect(() => {
    return () => {
      if (pendingNavRef.current) clearTimeout(pendingNavRef.current);
    };
  }, []);

  useEffect(() => {
    if (stage.kind !== "looking-up") return;
    const t = setTimeout(() => setSlowHint(true), 2500);
    return () => {
      clearTimeout(t);
      setSlowHint(false);
    };
  }, [stage.kind]);

  const runLookup = useCallback((barcode: string) => {
    setStage({ kind: "looking-up", barcode });
    startTransition(async () => {
      const res = await lookupBarcode(barcode);
      if (!res.ok) {
        setStage({ kind: "lookup-error", message: res.error, barcode });
        return;
      }
      setStage({ kind: "preview", barcode, result: res });
    });
  }, []);

  const handleDetected = useCallback(
    (barcode: string) => {
      if (stage.kind === "looking-up" || stage.kind === "validating-barcode") return;
      if (stage.kind === "preview" && stage.barcode === barcode) return;
      if (failedBarcodesRef.current.has(barcode)) return;

      setStage({ kind: "validating-barcode", barcode });

      startTransition(async () => {
        const res = await lookupBarcode(barcode);
        if (!res.ok) {
          failedBarcodesRef.current.add(barcode);
          setStage({ kind: "lookup-error", message: res.error, barcode });
          return;
        }
        if (res.data.source === "unknown") {
          failedBarcodesRef.current.add(barcode);
        }
        setStage({ kind: "preview", barcode, result: res });
      });
    },
    [stage, startTransition],
  );

  const resetToScanner = useCallback(() => {
    setStage({ kind: "scan" });
  }, []);

  const handlePhotoMode = useCallback((barcode: string) => {
    pendingBarcodeRef.current = barcode;
    setPhotoHintMode(true);
    setStage({ kind: "scan" });
  }, []);

  const handlePhotoCandidates = useCallback((candidates: ProductCandidate[]) => {
    lastCandidatesRef.current = candidates;
    pendingBarcodeRef.current = null;
    setPhotoHintMode(false);
    setStage({ kind: "photo-candidates", candidates });
  }, []);

  const handleWrongProduct = useCallback(() => {
    if (lastCandidatesRef.current.length > 0) {
      setStage({ kind: "photo-candidates", candidates: lastCandidatesRef.current });
    } else {
      setStage({ kind: "scan" });
    }
  }, []);

  const handleSubmitSuccess = useCallback(() => {
    // Fire-and-forget when we came from the shopping list: the server
    // action idempotently sets `bought_at` and revalidates /shopping, so
    // when the user eventually navigates there the row is already in the
    // "zuletzt gekauft" bucket. We don't await it — the `/` navigation
    // below shouldn't block on a secondary write.
    if (initial?.shoppingListItemId) {
      void markShoppingItemBought(initial.shoppingListItemId);
    }
    const TOAST_MS = 4000;
    pendingNavRef.current = setTimeout(() => router.push("/"), TOAST_MS + 500);
    toast.success("Artikel hinzugefügt", {
      action: {
        label: "Weiteren hinzufügen",
        onClick: () => {
          if (pendingNavRef.current) clearTimeout(pendingNavRef.current);
          resetToScanner();
        },
      },
      duration: TOAST_MS,
    });
  }, [router, initial, resetToScanner]);

  // FORM stage — dedicated branch to keep JSX compact.
  if (stage.kind === "form") {
    return (
      <ItemForm
        seed={stage.seed}
        prefill={initial?.prefill}
        initialItemCategory={initialItemCategory}
        categories={categories}
        storageLocations={storageLocations}
        onCancel={resetToScanner}
        onSuccess={handleSubmitSuccess}
        onWrongProduct={
          (stage.seed.kind === "vision" || stage.seed.kind === "off")
            ? handleWrongProduct
            : undefined
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {(stage.kind === "scan" || stage.kind === "validating-barcode") && (
        <div className="relative">
          <LiveScanner
            onBarcodeDetected={handleDetected}
            onPhotoAnalyzing={() => { setPhotoHintMode(false); setStage({ kind: "photo-analyzing" }); }}
            onPhotoCandidates={handlePhotoCandidates}
            onPhotoError={(msg) => toast.error(msg)}
            onManualBarcode={() => setStage({ kind: "manual-barcode" })}
            onManualEntry={() => setStage({ kind: "form", seed: { kind: "manual" } })}
            isLookingUp={stage.kind === "validating-barcode"}
            showPhotoHint={photoHintMode}
          />
          {stage.kind === "validating-barcode" && (
            <div className="absolute left-1/2 top-3 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-foreground/40 px-3 py-1 backdrop-blur-sm">
              <Loader2 className="size-3 animate-spin text-neutral-0" aria-hidden />
              <span className="text-xs text-neutral-0">Prüfe…</span>
            </div>
          )}
        </div>
      )}

      {stage.kind === "manual-barcode" && (
        <ManualBarcodeEntry
          disabled={false}
          onSubmit={runLookup}
          onCancel={resetToScanner}
        />
      )}

      {stage.kind === "looking-up" && (
        <Card>
          <CardContent className="flex flex-col gap-3 py-4">
            <div className="flex items-center gap-3">
              <Loader2 className="size-5 animate-spin text-muted" aria-hidden />
              <div>
                <p className="font-medium">Nachschlagen…</p>
                <p className="font-mono text-xs text-muted">Barcode {stage.barcode}</p>
              </div>
            </div>
            {slowHint && (
              <p className="text-xs text-muted-foreground">
                Dauert etwas länger – schlechtes Netz?{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => setStage({ kind: "form", seed: { kind: "manual" } })}
                >
                  Manuell eingeben
                </button>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {stage.kind === "lookup-error" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <XCircle className="size-5 text-danger" aria-hidden />
              Fehler
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">{stage.message}</p>
            <p className="font-mono text-xs text-muted">Barcode {stage.barcode}</p>
            <Button variant="outline" size="sm" onClick={resetToScanner}>
              Neu scannen
            </Button>
          </CardContent>
        </Card>
      )}

      {stage.kind === "preview" && (
        <LookupPreview
          barcode={stage.barcode}
          result={stage.result}
          onContinue={(seed) => setStage({ kind: "form", seed })}
          onReset={resetToScanner}
          onPhotoMode={handlePhotoMode}
        />
      )}

      {stage.kind === "photo-analyzing" && (
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Loader2 className="size-5 animate-spin text-muted" aria-hidden />
            <div>
              <p className="font-medium">Produkt wird erkannt…</p>
              <p className="text-xs text-muted">Das dauert einen Moment.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {stage.kind === "photo-candidates" && (
        <PhotoCandidatesPicker
          candidates={stage.candidates}
          categories={categories}
          onSelect={(seed) => setStage({ kind: "form", seed })}
          onReset={resetToScanner}
          onManualEntry={() => setStage({ kind: "form", seed: { kind: "manual" } })}
        />
      )}
    </div>
  );
}

function ManualBarcodeEntry({
  disabled,
  onSubmit,
  onCancel,
}: {
  disabled: boolean;
  onSubmit: (barcode: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const canSubmit = /^\d{6,14}$/.test(value);

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit(value);
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="manual-barcode">Barcode</Label>
        <Input
          id="manual-barcode"
          inputMode="numeric"
          pattern="\d*"
          placeholder="z.B. 4000417025005"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
          autoFocus
          disabled={disabled}
        />
        <p className="text-xs text-muted">6–14 Ziffern</p>
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={!canSubmit || disabled}>
          Nachschlagen
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={disabled}>
          Zurück
        </Button>
      </div>
    </form>
  );
}

function LookupPreview({
  barcode,
  result,
  onContinue,
  onReset,
  onPhotoMode,
}: {
  barcode: string;
  result: LookupResult;
  onContinue: (seed: FormSeed) => void;
  onReset: () => void;
  onPhotoMode: (barcode: string) => void;
}) {
  // Server action returned ok:false — treated as error here.
  if (!result.ok) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <XCircle className="size-5 text-danger" aria-hidden />
            Fehler
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">{result.error}</p>
          <p className="font-mono text-xs text-muted">Barcode {barcode}</p>
          <Button variant="outline" size="sm" onClick={onReset}>
            Neu scannen
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { data } = result;

  // Unknown barcode: offer photo identification or manual entry.
  if (data.source === "unknown") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PackageSearch className="size-5 text-muted" aria-hidden />
            Noch unbekanntes Produkt
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            Wir kennen diesen Barcode noch nicht. Du kannst ein Foto machen,
            damit wir das Produkt erkennen – oder direkt manuell anlegen.
          </p>
          <p className="font-mono text-xs text-muted">Barcode {data.barcode}</p>
          <div className="flex flex-col gap-2 pt-1">
            <Button
              onClick={() => onPhotoMode(data.barcode)}
            >
              Foto aufnehmen
            </Button>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                variant="outline"
                onClick={() => onContinue({ kind: "unknown", barcode: data.barcode })}
              >
                Manuell erfassen
              </Button>
              <Button variant="ghost" onClick={onReset}>
                Neu scannen
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const product = data.product;
  const sourceLabel = data.source === "cache" ? "Cache" : "Open Food Facts";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-primary-text" aria-hidden />
          Gefunden
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-3">
          {product.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt=""
              className="size-16 shrink-0 rounded-lg border border-border object-contain"
            />
          )}
          <div className="min-w-0">
            <p className="truncate font-medium">{product.name}</p>
            {product.brand && (
              <p className="truncate text-sm text-muted">{product.brand}</p>
            )}
          </div>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted">
          <dt>Kategorie</dt>
          <dd>{product.category ?? "—"}</dd>
          <dt>Quelle</dt>
          <dd>{sourceLabel}</dd>
          <dt>Barcode</dt>
          <dd>{barcode}</dd>
        </dl>
        <div className="flex gap-2 pt-1">
          <Button
            className="flex-1"
            onClick={() => {
              // Narrow `data` per branch so TS sees the right `product` shape
              // (cache: string|null category, OFF: CategoryKey category).
              const seed: FormSeed =
                data.source === "cache"
                  ? {
                      kind: "known",
                      productId: data.productId,
                      productName: data.product.name,
                      brand: data.product.brand,
                      imageUrl: data.product.imageUrl,
                      category: data.product.category ?? "other",
                      barcode,
                      itemCategory: data.product.itemCategory,
                    }
                  : {
                      kind: "off",
                      productName: data.product.name,
                      brand: data.product.brand,
                      imageUrl: data.product.imageUrl,
                      category: data.product.category,
                      barcode,
                      itemCategory: data.product.itemCategory,
                    };
              onContinue(seed);
            }}
          >
            Weiter
          </Button>
          <Button variant="ghost" onClick={onReset}>
            Neu scannen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PhotoCandidatesPicker({
  candidates,
  categories,
  onSelect,
  onReset,
  onManualEntry,
}: {
  candidates: ProductCandidate[];
  categories: CategoryDisplay[];
  onSelect: (seed: FormSeed) => void;
  onReset: () => void;
  onManualEntry: () => void;
}) {
  function seedFromCandidate(c: ProductCandidate): FormSeed {
    // Derive itemCategory from CategoryKey: known food sub-type → food, else undefined.
    const itemCategory = c.category && c.category !== "other" ? ("food" as const) : undefined;
    // Enriched vision candidates and pure OFF candidates both have a barcode →
    // use the "off" path which guarantees the OFF image lands on the item.
    if ((c.source === "vision+off" || c.source === "off") && c.offBarcode) {
      return {
        kind: "off",
        productName: c.offProductName ?? c.name,
        brand: c.brand,
        imageUrl: c.offImageUrl ?? null,
        category: c.category,
        barcode: c.offBarcode,
        itemCategory,
      };
    }
    // Pure vision candidate — no OFF match found, no barcode, no image.
    return {
      kind: "vision",
      productName: c.name,
      brand: c.brand,
      imageUrl: null,
      category: c.category,
      itemCategory,
    };
  }

  function categoryLabel(slug: string): string {
    return categories.find((c) => c.slug === slug)?.name ?? slug;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="size-5 text-primary-text" aria-hidden />
          Erkannte Produkte
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {candidates.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <Camera className="size-10 text-muted-foreground/50" aria-hidden />
            <p className="text-sm font-medium">Kein Produkt erkannt</p>
            <p className="text-xs text-muted-foreground">
              Versuch es nochmal mit besserem Licht und halte das Etikett ins Bild.
            </p>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={onReset}>Nochmal fotografieren</Button>
              <Button variant="ghost" onClick={onManualEntry}>Manuell eingeben</Button>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {candidates.map((c, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onSelect(seedFromCandidate(c))}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-surface-raised"
                >
                  {c.offImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.offImageUrl}
                      alt=""
                      className="size-10 shrink-0 rounded-lg border border-border object-contain"
                    />
                  ) : (
                    <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-surface-raised">
                      <Camera className="size-4 text-muted" aria-hidden />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-xs text-muted">
                        {[c.brand, categoryLabel(c.category)].filter(Boolean).join(" · ")}
                      </p>
                      <span className={cn(
                        "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                        c.source === "vision+off"
                          ? "bg-primary-subtle text-primary-text"
                          : c.source === "vision"
                            ? "bg-warning-subtle text-warning"
                            : "bg-surface-raised text-muted",
                      )}>
                        {c.source === "vision+off" ? "Erkannt + OFF"
                          : c.source === "vision" ? "Nur erkannt"
                          : "Open Food Facts"}
                      </span>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2 pt-1">
          <Button
            className="flex-1"
            variant="outline"
            onClick={onManualEntry}
          >
            <Pencil aria-hidden />
            {candidates.length === 1 ? "Anderes Produkt – manuell eingeben" : "Manuell eingeben"}
          </Button>
          <Button variant="ghost" onClick={onReset}>
            Zurück
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
