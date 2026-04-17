"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, KeyboardIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  createDetector,
  type Detector,
  type DetectorEngine,
} from "@/lib/barcode/detector";

/**
 * Camera-driven barcode scanner for EAN-8/13 and UPC-A/E.
 *
 * Keeps the camera lifecycle local: requests the rear camera via
 * `getUserMedia`, attaches to the video element, hands the element to
 * the detector, and tears both down on unmount. The parent only sees
 * scanned barcodes and lifecycle errors.
 *
 * Permission UX:
 *  - `idle` → user must tap "Kamera starten" (iOS refuses getUserMedia
 *    outside a user gesture).
 *  - `starting` → getUserMedia in flight.
 *  - `running` → camera live, detector ticking.
 *  - `denied` / `unsupported` → friendly fallback with manual-entry CTA.
 */

type Status = "idle" | "starting" | "running" | "denied" | "unsupported" | "error";

type Props = {
  /** Fired once per unique detected code (dedup is done in the detector). */
  onDetected: (barcode: string) => void;
  /** CTA to fall back to typing the code by hand. Wired up by the parent. */
  onManualEntry?: () => void;
  className?: string;
};

export function BarcodeScanner({ onDetected, onManualEntry, className }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<Detector | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [engine, setEngine] = useState<DetectorEngine | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Route every detection through a ref so the callback can be stable.
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  const stop = useCallback(() => {
    detectorRef.current?.stop();
    detectorRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
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

      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = stream;
      // iOS Safari needs muted + playsInline set before play()
      video.muted = true;
      video.playsInline = true;
      await video.play();

      const detector = await createDetector();
      detectorRef.current = detector;
      setEngine(detector.engine);

      await detector.start(video, (code) => {
        onDetectedRef.current(code);
      });

      setStatus("running");
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setStatus("denied");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setStatus("unsupported");
      } else {
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : "Unbekannter Fehler");
      }
      stop();
    }
  }, [stop]);

  // Teardown on unmount is non-negotiable — otherwise the torch stays on.
  useEffect(() => {
    return () => stop();
  }, [stop]);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-black">
        <video
          ref={videoRef}
          className={cn(
            "h-full w-full object-cover transition-opacity",
            status === "running" ? "opacity-100" : "opacity-0",
          )}
          aria-label="Kamera-Vorschau"
        />

        {/* Viewfinder overlay — only visible when the camera is live. */}
        {status === "running" && <ViewfinderOverlay />}

        {status !== "running" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            {status === "idle" && (
              <>
                <Camera className="size-12" aria-hidden />
                <p className="text-sm">Barcode scannen</p>
              </>
            )}
            {status === "starting" && (
              <>
                <Loader2 className="size-8 animate-spin" aria-hidden />
                <p className="text-sm">Kamera wird gestartet…</p>
              </>
            )}
            {status === "denied" && (
              <>
                <CameraOff className="size-12" aria-hidden />
                <p className="px-6 text-sm">
                  Kamerazugriff verweigert. Bitte in den Browser-Einstellungen erlauben.
                </p>
              </>
            )}
            {status === "unsupported" && (
              <>
                <CameraOff className="size-12" aria-hidden />
                <p className="px-6 text-sm">
                  Keine Kamera verfügbar. Barcode manuell eingeben.
                </p>
              </>
            )}
            {status === "error" && (
              <>
                <CameraOff className="size-12" aria-hidden />
                <p className="px-6 text-sm">{errorMsg ?? "Kamera konnte nicht gestartet werden."}</p>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {status === "idle" && (
          <Button className="flex-1" size="lg" onClick={() => void start()}>
            <Camera aria-hidden /> Kamera starten
          </Button>
        )}
        {status === "running" && (
          <Button
            className="flex-1"
            size="lg"
            variant="outline"
            onClick={() => {
              stop();
              setStatus("idle");
              setEngine(null);
            }}
          >
            Stoppen
          </Button>
        )}
        {(status === "denied" || status === "unsupported" || status === "error") && (
          <Button
            className="flex-1"
            size="lg"
            variant="outline"
            onClick={() => void start()}
          >
            Erneut versuchen
          </Button>
        )}
        {onManualEntry && (
          <Button size="lg" variant="ghost" onClick={onManualEntry}>
            <KeyboardIcon aria-hidden /> Manuell
          </Button>
        )}
      </div>

      {engine && status === "running" && (
        <p className="text-center text-xs text-muted-foreground">
          Erkennung: {engine === "native" ? "nativ" : "ZXing"}
        </p>
      )}
    </div>
  );
}

/** Corner brackets + horizontal sweep hint. No opacity on the video below. */
function ViewfinderOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute inset-x-6 inset-y-1/4 rounded-md border-2 border-white/60 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
      <div className="absolute inset-x-6 top-1/2 h-px -translate-y-1/2 bg-primary/70" />
    </div>
  );
}
