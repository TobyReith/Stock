"use client";

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { identifyProductFromPhoto } from "@/lib/actions/vision";
import type { ProductCandidate } from "@/lib/vision/types";
import { downscaleForVision } from "./mhd-downscale";

const MAX_INPUT_BYTES = 20 * 1024 * 1024;

type Props = {
  onAnalyzing: () => void;
  onCandidates: (candidates: ProductCandidate[]) => void;
  onError: (message: string) => void;
};

export function ProductPhotoCapture({ onAnalyzing, onCandidates, onError }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    if (!/^image\//.test(file.type)) {
      onError("Nur Bilddateien werden unterstützt.");
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      onError(`Bild zu groß (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum: 20 MB.`);
      return;
    }

    setBusy(true);
    onAnalyzing();

    try {
      let base64: string;
      try {
        const shrunk = await downscaleForVision(file);
        base64 = shrunk.base64;
      } catch (decodeErr) {
        onError(
          decodeErr instanceof Error && /decode|bitmap|encode/i.test(decodeErr.message)
            ? "Bild konnte nicht gelesen werden. Bitte JPEG/PNG verwenden."
            : "Foto konnte nicht verarbeitet werden.",
        );
        return;
      }

      const res = await identifyProductFromPhoto({ base64, mimeType: "image/jpeg" });
      if (!res.ok) {
        onError(res.error);
        return;
      }
      onCandidates(res.data.candidates);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Foto konnte nicht verarbeitet werden.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled={busy}
        className="w-full"
        onClick={() => inputRef.current?.click()}
      >
        {busy ? (
          <>
            <Loader2 className="animate-spin" aria-hidden /> Erkenne Produkt…
          </>
        ) : (
          <>
            <Camera aria-hidden /> Produkt fotografieren
          </>
        )}
      </Button>
    </>
  );
}
