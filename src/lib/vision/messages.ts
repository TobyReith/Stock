import type { VisionFailureReason } from "./types";

/**
 * UI-side German strings for the typed failure reasons returned from the
 * vision pipeline. Lives outside `actions/vision.ts` because that file is
 * `"use server"` (only async exports allowed).
 */
const REASON_DE: Record<VisionFailureReason, string> = {
  not_found: "Kein MHD auf dem Bild erkannt.",
  ambiguous: "Mehrere Datumsangaben gefunden — bitte manuell wählen.",
  unparseable: "Antwort konnte nicht verarbeitet werden.",
  rejected: "Bild wurde abgelehnt.",
};

export function reasonMessage(reason: VisionFailureReason): string {
  return REASON_DE[reason];
}
