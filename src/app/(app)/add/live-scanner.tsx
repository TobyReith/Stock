"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, CheckCircle2, Flashlight, FlashlightOff, KeyboardIcon, Loader2, Pencil, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  createDetector,
  type Detector,
} from "@/lib/barcode/detector";
import { identifyProductFromPhoto } from "@/lib/actions/vision";
import type { ProductCandidate } from "@/lib/vision/types";

interface ExtendedCapabilities extends MediaTrackCapabilities {
  focusMode?: string[];
  torch?: boolean;
}

interface ExtendedConstraintSet extends MediaTrackConstraintSet {
  pointsOfInterest?: { x: number; y: number }[];
  focusMode?: string;
}


/**
 * Unified live-camera scanner for the Add-Flow.
 *
 * Combines barcode detection with a shutter button for vision-based product
 * identification — replacing the old two-button layout (BarcodeScanner +
 * ProductPhotoCapture) with a single Google-Lens-style interface.
 *
 * Camera auto-starts on mount. On iOS Safari getUserMedia requires a user
 * gesture, so a "Kamera starten" fallback button appears if auto-start fails.
 *
 * Barcode loop: runs via createDetector() (native BarcodeDetector or ZXing
 * fallback) at ~5 fps while the camera is live. Fires onBarcodeDetected once
 * per unique code.
 *
 * Shutter button: captures the current video frame to an off-screen canvas,
 * then calls identifyProductFromPhoto(). The frame is captured synchronously
 * before the component unmounts, so the async vision call always has valid
 * pixel data.
 *
 * After 4 s without a barcode hit, a subtle hint nudges the user toward the
 * shutter.
 */

type CameraStatus =
  | "idle"
  | "starting"
  | "running"
  | "denied"
  | "unsupported"
  | "error";

type Props = {
  onBarcodeDetected: (barcode: string) => void;
  onPhotoAnalyzing: () => void;
  onPhotoCandidates: (candidates: ProductCandidate[]) => void;
  onPhotoError: (message: string) => void;
  onManualBarcode: () => void;
  onManualEntry: () => void;
  /** Parent is processing a detected barcode (lookup in flight). Drives the "Barcode erkannt" status. */
  isLookingUp?: boolean;
  className?: string;
};

export function LiveScanner({
  onBarcodeDetected,
  onPhotoAnalyzing,
  onPhotoCandidates,
  onPhotoError,
  onManualBarcode,
  onManualEntry,
  isLookingUp = false,
  className,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<Detector | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [focusMode, setFocusMode] = useState<"single-shot" | null>(null);
  const [focusRing, setFocusRing] = useState<{ x: number; y: number; fading: boolean } | null>(null);
  const focusRingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusRestoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onBarcodeRef = useRef(onBarcodeDetected);
  useEffect(() => {
    onBarcodeRef.current = onBarcodeDetected;
  }, [onBarcodeDetected]);

  const stop = useCallback(() => {
    detectorRef.current?.stop();
    detectorRef.current = null;
    // Turn off torch before stopping tracks so the light doesn't stay on.
    const track = streamRef.current?.getVideoTracks()[0];
    if (track) void track.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setTorchOn(false);
    setTorchSupported(false);
    setFocusMode(null);
    setFocusRing(null);
    if (focusRingTimerRef.current) clearTimeout(focusRingTimerRef.current);
    if (focusRestoreTimerRef.current) clearTimeout(focusRestoreTimerRef.current);
  }, []);

  const start = useCallback(async () => {
    setErrorMsg(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      return;
    }
    setStatus("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;

      // Check torch and focus support after acquiring the stream.
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const caps = videoTrack.getCapabilities() as ExtendedCapabilities;
        setTorchSupported(!!caps.torch);
        const modes = caps.focusMode ?? [];
        setFocusMode(modes.includes("single-shot") ? "single-shot" : null);
        // Explicitly engage continuous autofocus. The `focusMode` constraint
        // passed to getUserMedia is non-standard at the top level and gets
        // ignored on most browsers — applyConstraints with `advanced` is the
        // only reliable path to actually turn AF on. Without this, many
        // Android devices stay locked at infinity and the barcode is blurry.
        if (modes.includes("continuous")) {
          void videoTrack.applyConstraints({
            advanced: [{ focusMode: "continuous" } as ExtendedConstraintSet],
          }).catch(() => {});
        }
      }

      const video = videoRef.current;
      if (!video) { stream.getTracks().forEach((t) => t.stop()); return; }
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();

      const detector = await createDetector();
      detectorRef.current = detector;

      await detector.start(video, (code) => {
        navigator.vibrate?.(50);
        onBarcodeRef.current(code);
      });

      setStatus("running");
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") setStatus("denied");
      else if (name === "NotFoundError" || name === "OverconstrainedError") setStatus("unsupported");
      else { setStatus("error"); setErrorMsg(err instanceof Error ? err.message : "Unbekannter Fehler"); }
      stop();
    }
  }, [stop]);

  // Auto-start on mount. On Chrome/Android this succeeds immediately.
  // On iOS Safari getUserMedia requires a user gesture so it falls back to
  // the manual "Kamera starten" button (status stays "idle" after the
  // NotAllowedError → denied branch above… actually auto-start from useEffect
  // will fail with NotAllowedError on iOS, setting status to "denied").
  // We handle this gracefully by showing a "Kamera starten" button when denied.
  useEffect(() => {
    void start();
    return () => stop();
  }, [start, stop]);

  const handleShutter = useCallback(async () => {
    const video = videoRef.current;
    if (!video || capturing || video.readyState < 2) return;

    // Draw frame synchronously before any await so the pixel data is safe
    // even if the component unmounts when onPhotoAnalyzing() triggers a
    // stage change in the parent.
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) { onPhotoError("Canvas nicht verfügbar."); return; }
    ctx.drawImage(video, 0, 0);

    // Convert to base64 (async, but canvas holds the frame already).
    let base64: string;
    try {
      base64 = await canvasToBase64(canvas);
    } catch {
      onPhotoError("Foto konnte nicht aufgenommen werden.");
      return;
    }

    // Update parent state — component will unmount, but async call continues.
    setCapturing(true);
    onPhotoAnalyzing();

    try {
      const res = await identifyProductFromPhoto({ base64, mimeType: "image/jpeg" });
      if (!res.ok) { onPhotoError(res.error); return; }
      onPhotoCandidates(res.data.candidates);
    } catch (err) {
      onPhotoError(err instanceof Error ? err.message : "Foto konnte nicht verarbeitet werden.");
    }
  }, [capturing, onPhotoAnalyzing, onPhotoCandidates, onPhotoError]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch {
      // Torch applyConstraints failed (e.g. permission revoked) — ignore.
    }
  }, [torchOn]);

  const handleTapToFocus = useCallback(async (e: React.MouseEvent<HTMLVideoElement>) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !focusMode) return;

    const video = e.currentTarget;
    const rect = video.getBoundingClientRect();
    const pixelX = e.clientX - rect.left;
    const pixelY = e.clientY - rect.top;

    // Account for object-cover cropping: the video stream (e.g. 16:9) is scaled
    // to fill the container (4:3) so one axis is clipped. Map tap coordinates
    // into the video's intrinsic coordinate space, not just the element box.
    let normX = pixelX / rect.width;
    let normY = pixelY / rect.height;
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      const videoAspect = video.videoWidth / video.videoHeight;
      const boxAspect = rect.width / rect.height;
      if (videoAspect > boxAspect) {
        const renderedWidth = rect.height * videoAspect;
        const cropX = (renderedWidth - rect.width) / 2;
        normX = (pixelX + cropX) / renderedWidth;
      } else {
        const renderedHeight = rect.width / videoAspect;
        const cropY = (renderedHeight - rect.height) / 2;
        normY = (pixelY + cropY) / renderedHeight;
      }
      normX = Math.min(1, Math.max(0, normX));
      normY = Math.min(1, Math.max(0, normY));
    }

    // Show focus ring: appear animation (~300ms), then fade out.
    if (focusRingTimerRef.current) clearTimeout(focusRingTimerRef.current);
    setFocusRing({ x: pixelX, y: pixelY, fading: false });
    focusRingTimerRef.current = setTimeout(() => {
      setFocusRing((prev) => (prev ? { ...prev, fading: true } : null));
      focusRingTimerRef.current = setTimeout(() => setFocusRing(null), 300);
    }, 300);

    try {
      await track.applyConstraints({
        advanced: [{ focusMode: "single-shot", pointsOfInterest: [{ x: normX, y: normY }] } as ExtendedConstraintSet],
      });
      // Restore continuous autofocus after 500ms so the camera doesn't lock on the tapped point.
      if (focusRestoreTimerRef.current) clearTimeout(focusRestoreTimerRef.current);
      focusRestoreTimerRef.current = setTimeout(() => {
        focusRestoreTimerRef.current = null;
        void track.applyConstraints({
          advanced: [{ focusMode: "continuous" } as ExtendedConstraintSet],
        }).catch(() => {});
      }, 500);
    } catch {
      // Device does not support focus control — silently ignore.
    }
  }, [focusMode]);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Camera viewport */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-neutral-900">
        <video
          ref={videoRef}
          className={cn(
            "h-full w-full object-cover transition-opacity",
            status === "running" ? "opacity-100" : "opacity-0",
            focusMode !== null && status === "running" && "cursor-crosshair",
          )}
          aria-label="Kamera-Vorschau"
          onClick={(e) => void handleTapToFocus(e)}
        />

        {/* Tap-to-focus ring — appears at tap position, shrinks in, then fades out */}
        {focusRing && (
          <div
            className={cn(
              "pointer-events-none absolute w-16 h-16 rounded-full border-2 border-primary transition-opacity duration-300",
              focusRing.fading ? "opacity-0" : "opacity-100",
            )}
            style={{
              left: focusRing.x,
              top: focusRing.y,
              transform: "translate(-50%, -50%)",
              animation: focusRing.fading ? undefined : "focus-ring-appear 0.3s ease-out forwards",
            }}
            aria-hidden
          />
        )}

        {/* Torch button — top-right corner, only on devices that support it */}
        {status === "running" && torchSupported && (
          <button
            type="button"
            onClick={() => void toggleTorch()}
            aria-label={torchOn ? "Taschenlampe ausschalten" : "Taschenlampe einschalten"}
            aria-pressed={torchOn}
            className={cn(
              "absolute right-3 top-3 flex size-10 items-center justify-center rounded-full transition-colors",
              torchOn
                ? "bg-warning text-warning-subtle"
                : "bg-foreground/40 text-neutral-0 backdrop-blur-sm",
            )}
          >
            {torchOn ? (
              <FlashlightOff className="size-5" aria-hidden />
            ) : (
              <Flashlight className="size-5" aria-hidden />
            )}
          </button>
        )}

        {/* States: idle / starting / denied / unsupported / error */}
        {status !== "running" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center text-neutral-0/80">
            {status === "idle" && (
              <>
                <Camera className="size-12" aria-hidden />
                <p className="text-sm">Kamera bereit</p>
              </>
            )}
            {status === "starting" && (
              <>
                <Loader2 className="size-8 animate-spin" aria-hidden />
                <p className="text-sm">Kamera wird gestartet…</p>
              </>
            )}
            {(status === "denied" || status === "unsupported" || status === "error") && (
              <>
                <CameraOff className="size-12" aria-hidden />
                <p className="px-6 text-sm">
                  {status === "denied"
                    ? "Kamerazugriff verweigert. Bitte in den Browser-Einstellungen erlauben."
                    : status === "unsupported"
                      ? "Keine Kamera verfügbar."
                      : (errorMsg ?? "Kamera konnte nicht gestartet werden.")}
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Scanner status line */}
      {status === "running" && (
        isLookingUp ? (
          <div className="flex items-center justify-center gap-2 py-2">
            <CheckCircle2 size={15} className="text-primary-text" aria-hidden />
            <span className="text-[13px] font-medium text-primary-text">Barcode erkannt</span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 py-2">
            <ScanLine size={15} className="text-muted" aria-hidden />
            <span className="text-[13px] font-medium text-muted">Kein Barcode gefunden</span>
          </div>
        )
      )}

      {/* Action buttons below the viewport */}
      <div className="flex gap-2">
        {(status === "idle" || status === "denied" || status === "unsupported" || status === "error") && (
          <Button className="flex-1" size="lg" onClick={() => void start()}>
            <Camera aria-hidden />
            {status === "idle" ? "Kamera starten" : "Erneut versuchen"}
          </Button>
        )}
        {status === "running" && (
          <Button
            size="lg"
            variant="outline"
            onClick={() => void handleShutter()}
            disabled={capturing}
            className="flex-1"
          >
            {capturing ? (
              <><Loader2 className="animate-spin" aria-hidden /> Erkenne Produkt…</>
            ) : (
              <><Camera aria-hidden /> Produkt fotografieren</>
            )}
          </Button>
        )}
        <Button size="lg" variant="ghost" onClick={onManualBarcode}>
          <KeyboardIcon aria-hidden /> Manuell
        </Button>
      </div>

      {/* Ohne Barcode */}
      <Button variant="outline" size="lg" onClick={onManualEntry}>
        <Pencil aria-hidden /> Ohne Barcode hinzufügen
      </Button>

    </div>
  );
}

function canvasToBase64(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) { reject(new Error("Canvas encode failed")); return; }
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          if (typeof result !== "string") { reject(new Error("FileReader result not string")); return; }
          const comma = result.indexOf(",");
          resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };
        reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
        reader.readAsDataURL(blob);
      },
      "image/jpeg",
      0.88,
    );
  });
}
