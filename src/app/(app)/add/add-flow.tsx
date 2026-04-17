"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Pencil, SearchX, XCircle } from "lucide-react";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lookupBarcode } from "@/lib/actions/items";
import type { CategoryKey } from "@/lib/constants/categories";
import { ItemForm, type FormSeed } from "./item-form";

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
  | { kind: "looking-up"; barcode: string }
  | { kind: "lookup-error"; message: string; barcode: string }
  | { kind: "preview"; barcode: string; result: LookupResult }
  | { kind: "form"; seed: FormSeed };

export function AddFlow() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: "scan" });
  const [, startTransition] = useTransition();

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

  // Debounce during in-flight lookup so duplicate scan frames don't pile up.
  const handleDetected = useCallback(
    (barcode: string) => {
      if (stage.kind === "looking-up") return;
      if (stage.kind === "preview" && stage.barcode === barcode) return;
      runLookup(barcode);
    },
    [stage, runLookup],
  );

  const resetToScanner = useCallback(() => {
    setStage({ kind: "scan" });
  }, []);

  const handleSubmitSuccess = useCallback(() => {
    toast.success("Artikel hinzugefügt");
    router.push("/");
  }, [router]);

  // FORM stage — dedicated branch to keep JSX compact.
  if (stage.kind === "form") {
    return (
      <ItemForm
        seed={stage.seed}
        onCancel={resetToScanner}
        onSuccess={handleSubmitSuccess}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {stage.kind === "scan" && (
        <>
          <BarcodeScanner
            onDetected={handleDetected}
            onManualEntry={() => setStage({ kind: "manual-barcode" })}
          />
          <Button
            variant="outline"
            size="lg"
            onClick={() => setStage({ kind: "form", seed: { kind: "manual" } })}
          >
            <Pencil aria-hidden /> Ohne Barcode hinzufügen
          </Button>
        </>
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
          <CardContent className="flex items-center gap-3 py-4">
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
            <div>
              <p className="font-medium">Nachschlagen…</p>
              <p className="text-xs text-muted-foreground">Barcode {stage.barcode}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {stage.kind === "lookup-error" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <XCircle className="size-5 text-destructive" aria-hidden />
              Fehler
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">{stage.message}</p>
            <p className="text-xs text-muted-foreground">Barcode {stage.barcode}</p>
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
      className="flex flex-col gap-3 rounded-lg border p-4"
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
        <p className="text-xs text-muted-foreground">6–14 Ziffern</p>
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
}: {
  barcode: string;
  result: LookupResult;
  onContinue: (seed: FormSeed) => void;
  onReset: () => void;
}) {
  // Server action returned ok:false — treated as error here.
  if (!result.ok) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <XCircle className="size-5 text-destructive" aria-hidden />
            Fehler
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">{result.error}</p>
          <p className="text-xs text-muted-foreground">Barcode {barcode}</p>
          <Button variant="outline" size="sm" onClick={onReset}>
            Neu scannen
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { data } = result;

  // Unknown barcode: hand the form the barcode + empty product fields.
  if (data.source === "unknown") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SearchX className="size-5 text-muted-foreground" aria-hidden />
            Unbekannter Barcode
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            Weder im Cache noch bei Open Food Facts. Du kannst das Produkt
            manuell anlegen — Barcode bleibt erhalten.
          </p>
          <p className="text-xs text-muted-foreground">Barcode {data.barcode}</p>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => onContinue({ kind: "unknown", barcode: data.barcode })}
            >
              Manuell anlegen
            </Button>
            <Button variant="ghost" onClick={onReset}>
              Abbrechen
            </Button>
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
          <CheckCircle2 className="size-5 text-primary" aria-hidden />
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
              className="size-16 shrink-0 rounded border object-contain"
            />
          )}
          <div className="min-w-0">
            <p className="truncate font-medium">{product.name}</p>
            {product.brand && (
              <p className="truncate text-sm text-muted-foreground">{product.brand}</p>
            )}
          </div>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
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
                      category: (data.product.category ?? "other") as CategoryKey,
                      barcode,
                    }
                  : {
                      kind: "off",
                      productName: data.product.name,
                      brand: data.product.brand,
                      imageUrl: data.product.imageUrl,
                      category: data.product.category,
                      barcode,
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
