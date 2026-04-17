/**
 * Barcode detection abstraction.
 *
 * Strategy:
 *   1. Native `BarcodeDetector` (Shape Detection API) if available.
 *      Chrome Android, Safari 17+ iOS — fast, zero bundle cost.
 *   2. `@zxing/browser` fallback — ~200 KB gzipped, works everywhere.
 *
 * The caller owns the `<video>` element and the lifecycle (start/stop).
 * This module exposes a single `createDetector()` factory that hides
 * which implementation is running.
 *
 * Only EAN-8 / EAN-13 / UPC-A / UPC-E matter for Open Food Facts, so
 * we restrict both paths to those formats to cut false positives from
 * QR codes on the same packaging.
 */

import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat as ZXingFormat, DecodeHintType } from "@zxing/library";

const PRODUCT_BARCODE_FORMATS: BarcodeFormat[] = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
];

const ZXING_FORMATS = [
  ZXingFormat.EAN_13,
  ZXingFormat.EAN_8,
  ZXingFormat.UPC_A,
  ZXingFormat.UPC_E,
];

export type DetectorEngine = "native" | "zxing";

export type Detector = {
  engine: DetectorEngine;
  /** Start scanning the given video stream. Fires `onResult` once per unique code. */
  start(video: HTMLVideoElement, onResult: (code: string) => void): Promise<void>;
  /** Stop the scan loop and release any internal timers. Does NOT stop the stream. */
  stop(): void;
};

/** Is the native BarcodeDetector both present AND able to read product barcodes? */
async function nativeIsUsable(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("BarcodeDetector" in window)) return false;
  try {
    const supported = await BarcodeDetector.getSupportedFormats();
    return PRODUCT_BARCODE_FORMATS.some((f) => supported.includes(f));
  } catch {
    return false;
  }
}

function createNativeDetector(): Detector {
  const detector = new BarcodeDetector({ formats: PRODUCT_BARCODE_FORMATS });
  let rafId = 0;
  let stopped = false;

  return {
    engine: "native",
    async start(video, onResult) {
      stopped = false;
      let lastSeen = "";

      const tick = async () => {
        if (stopped) return;
        // `readyState >= 2` = HAVE_CURRENT_DATA; detect throws on empty frames.
        if (video.readyState >= 2) {
          try {
            const results = await detector.detect(video);
            for (const r of results) {
              if (r.rawValue && r.rawValue !== lastSeen) {
                lastSeen = r.rawValue;
                onResult(r.rawValue);
              }
            }
          } catch {
            // Transient detect errors (e.g. video resize) — keep ticking.
          }
        }
        rafId = requestAnimationFrame(() => void tick());
      };

      rafId = requestAnimationFrame(() => void tick());
    },
    stop() {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
    },
  };
}

function createZXingDetector(): Detector {
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, ZXING_FORMATS);
  hints.set(DecodeHintType.TRY_HARDER, true);

  const reader = new BrowserMultiFormatReader(hints, {
    delayBetweenScanAttempts: 150,
    delayBetweenScanSuccess: 2000,
  });
  let controls: { stop: () => void } | null = null;

  return {
    engine: "zxing",
    async start(video, onResult) {
      let lastSeen = "";
      controls = await reader.decodeFromVideoElement(video, (result) => {
        if (!result) return;
        const value = result.getText();
        if (value && value !== lastSeen) {
          lastSeen = value;
          onResult(value);
        }
      });
    },
    stop() {
      controls?.stop();
      controls = null;
    },
  };
}

/**
 * Creates the best detector available in the current browser.
 * Async because the native-capability check is async.
 */
export async function createDetector(): Promise<Detector> {
  if (await nativeIsUsable()) return createNativeDetector();
  return createZXingDetector();
}
