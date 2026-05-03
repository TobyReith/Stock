/**
 * Minimal ambient types for the Shape Detection API's `BarcodeDetector`.
 *
 * As of 2026 this is still in `@types/dom-shape-detection` / not part of
 * the stable lib.dom — we declare only what we actually call.
 * Spec: https://wicg.github.io/shape-detection-api/
 */

export {};

declare global {
  type BarcodeFormat =
    | "aztec"
    | "code_128"
    | "code_39"
    | "code_93"
    | "codabar"
    | "data_matrix"
    | "ean_13"
    | "ean_8"
    | "itf"
    | "pdf417"
    | "qr_code"
    | "upc_a"
    | "upc_e";

  interface DetectedBarcode {
    boundingBox: DOMRectReadOnly;
    rawValue: string;
    format: BarcodeFormat;
    cornerPoints: ReadonlyArray<{ x: number; y: number }>;
  }

  interface BarcodeDetectorOptions {
    formats?: BarcodeFormat[];
  }

  class BarcodeDetector {
    constructor(options?: BarcodeDetectorOptions);
    static getSupportedFormats(): Promise<BarcodeFormat[]>;
    detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>;
  }

  interface Window {
    BarcodeDetector?: typeof BarcodeDetector;
  }

  // `torch` and `focusMode` are not yet in the stable TypeScript DOM lib.
  interface MediaTrackCapabilities {
    torch?: boolean;
    focusMode?: string[];
  }
  interface MediaTrackConstraintSet {
    torch?: boolean;
    focusMode?: ConstrainDOMString;
  }
}
