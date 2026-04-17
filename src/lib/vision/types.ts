/**
 * Provider-neutral interface for the MHD-OCR vision step (ADR-0001).
 *
 * The default implementation uses Anthropic Claude Sonnet, but the call site
 * only ever sees this contract — swapping providers later (Gemini, GPT-4V,
 * a self-hosted model) means writing a new adapter, not touching callers.
 *
 * The contract is intentionally minimal: take an image, return either a
 * structured date or a typed reason why we couldn't extract one. No
 * retry / cost / caching policy bleeds through here — that's the
 * orchestrator's job in `extract-date.ts`.
 */

/** Common image MIME types we accept from the scanner / file picker. */
export type SupportedMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif";

export type VisionInput = {
  /** Raw image bytes, base64-encoded (no `data:` prefix). */
  base64: string;
  mimeType: SupportedMimeType;
};

/**
 * Successful extraction. `date` is ISO `YYYY-MM-DD`; if the label only had
 * a month (`MM.YYYY`), we round to the *last* day of that month — that's
 * the convention printed on EU foodstuffs ("mindestens haltbar bis Ende
 * <Monat>").
 */
export type ExtractedDate = {
  /** ISO `YYYY-MM-DD`. */
  date: string;
  /** Provider-reported confidence in [0, 1]. */
  confidence: number;
  /** Verbatim text the date was parsed from — useful for UI ("erkannt: 12.2026"). */
  raw: string;
  /** Hint about format: helps the UI explain ambiguous month-only dates. */
  precision: "day" | "month";
};

/**
 * Why extraction failed in a way the UI can branch on. Network errors and
 * unexpected exceptions are thrown — these are the *expected* failure modes.
 */
export type VisionFailureReason =
  /** No date-like text found on the image. */
  | "not_found"
  /** Multiple plausible dates and we couldn't pick one confidently. */
  | "ambiguous"
  /** Provider returned something we couldn't parse into our schema. */
  | "unparseable"
  /** Image was rejected (too small, NSFW filter, unsupported format). */
  | "rejected";

export type VisionResult =
  | { ok: true; value: ExtractedDate }
  | { ok: false; reason: VisionFailureReason; detail?: string };

/** The contract every provider implements. */
export interface VisionProvider {
  /** Stable identifier for logs / future telemetry. */
  readonly id: string;
  extractBestBeforeDate(input: VisionInput): Promise<VisionResult>;
}

/** Thrown for unexpected provider failures (network, auth, 5xx). */
export class VisionProviderError extends Error {
  readonly providerId: string;
  constructor(providerId: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "VisionProviderError";
    this.providerId = providerId;
  }
}
