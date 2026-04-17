"use client";

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { extractBestBefore } from "@/lib/actions/vision";
// IMPORTANT: `@/lib/vision` re-exports the server-only orchestrator — its
// transitive import of `anthropic.ts` tries to bundle `"server-only"` into
// the client. We only need the sync helper, so we reach in directly.
import { reasonMessage } from "@/lib/vision/messages";

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
 * On success → `onDate(iso)` pre-fills the form. On typed failure
 * (`not_found` / `ambiguous` / ...) → show a dismissible hint, user
 * enters the date manually. Network failures surface as a generic error.
 */

type SupportedMime = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

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
    const mime = file.type as SupportedMime;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mime)) {
      setHint("Format nicht unterstützt. Bitte JPEG/PNG verwenden.");
      return;
    }

    setBusy(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await extractBestBefore({ base64, mimeType: mime });

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

/** Read a Blob as base64 *without* the `data:...;base64,` prefix. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("FileReader lieferte kein String-Ergebnis"));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Dateifehler"));
    reader.readAsDataURL(file);
  });
}
