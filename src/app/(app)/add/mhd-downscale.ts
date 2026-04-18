/**
 * Client-side downscale for MHD photos before they go to the Vision API.
 *
 * Phones produce 3–12 MB JPEGs at 4000×3000 — way more than the OCR
 * needs, and painful to upload on flaky connections. We canvas-resize to
 * a 1600px long edge (MHD text stays crisp) and re-encode as JPEG at
 * q=0.85. Typical output is 200–500 KB, giving us ~5× smaller payloads
 * and plenty of headroom under `experimental.serverActions.bodySizeLimit`
 * (8 MB).
 *
 * Returns base64 (without the `data:...;base64,` prefix) + mime, ready
 * for `extractBestBefore`. Small inputs that already sit below the long
 * edge cap are still re-encoded so the output is always JPEG — keeps
 * the server action's mime handling trivial and strips any oversized PNG
 * screenshots of receipts people occasionally upload.
 *
 * `createImageBitmap` is a hot path: off-main-thread decode, EXIF
 * orientation applied via `imageOrientation: "from-image"`, supported by
 * every browser we target (iOS 15+, evergreen desktop). HEIC files that
 * iOS hasn't already transcoded will reject here — the caller surfaces
 * a friendly error.
 */

const LONG_EDGE_MAX = 1600;
const JPEG_QUALITY = 0.85;

export type DownscaleResult = {
  base64: string;
  mimeType: "image/jpeg";
  originalBytes: number;
  encodedBytes: number;
  width: number;
  height: number;
};

export async function downscaleForVision(file: File): Promise<DownscaleResult> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    const scale = Math.min(
      1,
      LONG_EDGE_MAX / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas-Kontext nicht verfügbar.");
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) =>
          b ? resolve(b) : reject(new Error("Bild konnte nicht kodiert werden.")),
        "image/jpeg",
        JPEG_QUALITY,
      );
    });

    const base64 = await blobToBase64(blob);
    return {
      base64,
      mimeType: "image/jpeg",
      originalBytes: file.size,
      encodedBytes: blob.size,
      width,
      height,
    };
  } finally {
    bitmap.close();
  }
}

/** Read a Blob as base64 *without* the `data:...;base64,` prefix. */
function blobToBase64(blob: Blob): Promise<string> {
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
    reader.readAsDataURL(blob);
  });
}
