import "server-only";
import { anthropicVisionProvider } from "./anthropic";
import type { VisionInput, VisionProvider, VisionResult } from "./types";

/**
 * Public entry point for the MHD-OCR step.
 *
 * Per ADR-0001 the call site shouldn't know which model it's talking to.
 * Today this just forwards to the Anthropic provider; once a second
 * provider exists (Gemini, GPT-4V, on-device), `pickProvider()` becomes
 * a real router (cheapest first → fall back on `unparseable`, etc.).
 *
 * Validation policy:
 * - Image must be ≤ 5 MiB (Anthropic limit is 5 MB; keep a small margin
 *   for base64 overhead callers handle).
 * - MIME must be one of the allowed image types.
 * - We do NOT downscale here — that belongs in the client layer where
 *   we have access to canvas; the action would do it on every retry.
 */

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME = new Set<VisionInput["mimeType"]>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/** Decoded base64 byte length without actually decoding (≈ 0.75 × b64 chars). */
function approxDecodedSize(base64: string): number {
  // Strip optional padding from the count.
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function pickProvider(): VisionProvider {
  return anthropicVisionProvider;
}

export async function extractBestBeforeDate(input: VisionInput): Promise<VisionResult> {
  if (!ALLOWED_MIME.has(input.mimeType)) {
    return { ok: false, reason: "rejected", detail: `MIME ${input.mimeType} nicht unterstützt` };
  }
  if (approxDecodedSize(input.base64) > MAX_IMAGE_BYTES) {
    return { ok: false, reason: "rejected", detail: "Bild zu groß (>5 MiB)" };
  }

  const provider = pickProvider();
  return provider.extractBestBeforeDate(input);
}

export type { ExtractedDate, VisionInput, VisionResult } from "./types";
export { VisionProviderError } from "./types";
