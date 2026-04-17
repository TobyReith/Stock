"use client";

import { useCallback, useState, useTransition } from "react";
import { CheckCircle2, Loader2, SearchX, XCircle } from "lucide-react";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lookupBarcode } from "@/lib/actions/items";

/**
 * PR 1.4 scope: prove the scan → lookup pipeline end-to-end.
 *
 * The Add-Flow *form* (quantity, MHD via OCR, location, submit) lands in
 * PR 1.5 — this page today just:
 *   1. Scans or accepts manual barcode
 *   2. Calls `lookupBarcode` server action
 *   3. Shows cache / OFF / unknown result as a preview card
 *
 * State machine lives in a single `mode` + `lookup` pair to keep the
 * scanner / manual-entry / result views mutually exclusive.
 */

type LookupState =
  | { kind: "idle" }
  | { kind: "pending"; barcode: string }
  | { kind: "error"; message: string; barcode: string }
  | {
      kind: "ok";
      barcode: string;
      result: Awaited<ReturnType<typeof lookupBarcode>>;
    };

type Mode = "scanner" | "manual";

export function AddFlow() {
  const [mode, setMode] = useState<Mode>("scanner");
  const [lookup, setLookup] = useState<LookupState>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();

  const runLookup = useCallback((barcode: string) => {
    setLookup({ kind: "pending", barcode });
    startTransition(async () => {
      const res = await lookupBarcode(barcode);
      if (!res.ok) {
        setLookup({ kind: "error", message: res.error, barcode });
        return;
      }
      setLookup({ kind: "ok", barcode, result: res });
    });
  }, []);

  // Scanner callback — dedup happens inside the detector, but we also guard
  // against re-lookup while a previous one is in flight.
  const handleDetected = useCallback(
    (barcode: string) => {
      if (lookup.kind === "pending") return;
      if (lookup.kind === "ok" && lookup.barcode === barcode) return;
      runLookup(barcode);
    },
    [lookup, runLookup],
  );

  return (
    <div className="flex flex-col gap-4">
      {mode === "scanner" ? (
        <BarcodeScanner
          onDetected={handleDetected}
          onManualEntry={() => setMode("manual")}
        />
      ) : (
        <ManualBarcodeEntry
          disabled={isPending}
          onSubmit={runLookup}
          onCancel={() => setMode("scanner")}
        />
      )}

      <LookupResult
        state={lookup}
        onReset={() => setLookup({ kind: "idle" })}
      />
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

function LookupResult({
  state,
  onReset,
}: {
  state: LookupState;
  onReset: () => void;
}) {
  if (state.kind === "idle") return null;

  if (state.kind === "pending") {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-4">
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
          <div>
            <p className="font-medium">Nachschlagen…</p>
            <p className="text-xs text-muted-foreground">Barcode {state.barcode}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (state.kind === "error") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <XCircle className="size-5 text-destructive" aria-hidden />
            Fehler
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">{state.message}</p>
          <p className="text-xs text-muted-foreground">Barcode {state.barcode}</p>
          <Button variant="outline" size="sm" onClick={onReset}>
            Erneut versuchen
          </Button>
        </CardContent>
      </Card>
    );
  }

  // state.kind === "ok"
  const { result, barcode } = state;
  if (!result.ok) {
    // Server action returned ok:false — treated as an error here.
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
            Dieser Barcode ist weder im lokalen Cache noch bei Open Food Facts
            bekannt. Manuelle Eingabe folgt in PR 1.5.
          </p>
          <p className="text-xs text-muted-foreground">Barcode {data.barcode}</p>
          <Button variant="outline" size="sm" onClick={onReset}>
            Neu scannen
          </Button>
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
        <div>
          <p className="font-medium">{product.name}</p>
          {product.brand && (
            <p className="text-sm text-muted-foreground">{product.brand}</p>
          )}
        </div>
        {product.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.name}
            className="h-32 w-32 rounded border object-contain"
          />
        )}
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <dt>Kategorie</dt>
          <dd>{product.category ?? "—"}</dd>
          <dt>Quelle</dt>
          <dd>{sourceLabel}</dd>
          <dt>Barcode</dt>
          <dd>{barcode}</dd>
        </dl>
        <p className="text-xs text-muted-foreground">
          Add-Flow (Menge, MHD, Lagerort) folgt in PR 1.5.
        </p>
        <Button variant="outline" size="sm" onClick={onReset}>
          Neu scannen
        </Button>
      </CardContent>
    </Card>
  );
}
