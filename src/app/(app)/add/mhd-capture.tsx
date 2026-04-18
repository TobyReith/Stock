"use client";

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { extractBestBefore } from "@/lib/actions/vision";
// IMPORTANT: `@/lib/vision` re-exports the server-only orchestrator — its
// transitive import of `anthropic.ts` tries to bundle `"server-only"` into
// the client. We only need the sync helper, so we reach in directly.
import { reasonMessage } from "@/lib/vision/messages";
import { downscaleForVision } from "./mhd-downscale";

/**
 * One-shot MHD photo → OCR helper.
 *
 * Uses a file input with `capture="environment"` — on phones this opens
 * the native camera, on desktop it falls back to file-picker. We chose
 * this over a live preview because:
 *   - The user only needs one frame, not a stream.
 *   - iOS Safari's `capture` attribute gives us the best still-photo UX
 *     for free (tap, shoot, confirm, return).
 *   - No permission gate we need to wire ourselves.
 *
 * Photos are downscaled client-side to a 1600 px long edge + re-encoded
 * as JPEG before hitting the server action (see `./mhd-downscale`).
 * That keeps upload payloads under ~500 KB — well inside the 8 MB
 * `serverActions.bodySizeLimit` — without degrading OCR accuracy.
 *
 * On success → `onDate(iso)` pre-fills the form. On typed failure
 * (`not_found` / `ambiguous` / ...) → show a dismissible hint, user
 * enters the date manually. Network failures surface as a generic error.
 */

/**
 * Sanity cap on the *input* file so we don't blow the tab's memory
 * decoding a 50 MB DSLR RAW preview or similar. After downscale the
 * actual upload is typically under 500 KB.
 */
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

type Props = {
  onDate: (iso: string, raw: string) => void;
  className?: string;
};

export function MhdCapture({ onDate, className }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  async function handleFile(file: File) {
    setHint(null);

    if (!/^image\//.test(file.type)) {
      setHint("Nur Bilddateien werden unterstützt.");
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      setHint(`Bild zu groß (${mb} MB). Maximum: 20 MB.`);
      return;
    }

    setBusy(true);
    try {
      let base64: string;
      try {
        const shrunk = await downscaleForVision(file);
        base64 = shrunk.base64;
      } catch (decodeErr) {
        // HEIC that iOS hasn't transcoded, or corrupt files, land here.
        // The native file-input usually hands back JPEG even on iPhone,
        // but it's worth a specific hint so the user knows *why*.
        setHint(
          decodeErr instanceof Error && /decode|bitmap|encode/i.test(decodeErr.message)
            ? "Bild konnte nicht gelesen werden. Bitte JPEG/PNG verwenden."
            : "Foto konnte nicht verarbeitet werden.",
        );
        return;
      }

      const res = await extractBestBefore({ base64, mimeType: "image/jpeg" });

      if (!res.ok) {
        setHint(`Vision-API: ${res.error}`);
        return;
      }
      const payload = res.data;
      if (!payload.ok) {
        setHint(reasonMessage(payload.reason));
        return;
      }
      onDate(payload.date.date, payload.date.raw);
    } catch (err) {
      setHint(err instanceof Error ? err.message : "Foto konnte nicht verarbeitet werden.");
    } finally {
      setBusy(false);
      // Allow re-picking the same file after a failed attempt.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={className}>
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
        size="sm"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? (
          <>
            <Loader2 className="animate-spin" aria-hidden /> Erkenne MHD…
          </>
        ) : (
          <>
            <Camera aria-hidden /> MHD scannen
          </>
        )}
      </Button>
      {hint && <p className="mt-2 text-xs text-destructive">{hint}</p>}
    </div>
  );
}
