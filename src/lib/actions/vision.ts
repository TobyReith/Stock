"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  extractBestBeforeDate as runExtraction,
  VisionProviderError,
  type ExtractedDate,
  type VisionFailureReason,
} from "@/lib/vision";
import { identifyProduct as runIdentification } from "@/lib/vision/identify-product";
import type { ProductCandidate } from "@/lib/vision/types";
import type { ActionResult } from "./items";

// NOTE: this file is "use server" — only async functions may be exported.
// Sync helpers like `reasonMessage` and the `VisionActionPayload` type live
// in `@/lib/vision/messages` and `@/lib/vision/types` respectively.

/**
 * Server Action wrapper around the vision pipeline.
 *
 * Why this lives separately from `items.ts`: the action is called from the
 * Add-Flow *before* the user commits an item — the extracted date pre-fills
 * the form, the user can correct it, then `addItem` runs. Co-locating it
 * with item mutations would muddle the boundary.
 *
 * Auth: requires a logged-in user. We don't need a household here (no DB
 * write), but anonymous calls would burn API credits.
 */

const inputSchema = z.object({
  base64: z
    .string()
    .min(100, "Bild zu klein")
    // Defensive: clients shouldn't send the data: prefix, but strip it if so.
    .transform((s) => s.replace(/^data:image\/[a-z]+;base64,/, "")),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
});

type VisionActionPayload =
  | { ok: true; date: ExtractedDate }
  | { ok: false; reason: VisionFailureReason; detail?: string };

export async function identifyProductFromPhoto(
  input: { base64: string; mimeType: string },
): Promise<ActionResult<{ candidates: ProductCandidate[] }>> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" };
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Nicht angemeldet" };

    const result = await runIdentification(parsed.data);
    if (!result.ok) {
      return { ok: false, error: result.reason === "rejected" ? "Bild wurde abgelehnt." : "Antwort konnte nicht verarbeitet werden." };
    }
    return { ok: true, data: { candidates: result.candidates } };
  } catch (err) {
    if (err instanceof VisionProviderError) {
      return { ok: false, error: `Vision-API: ${err.message}` };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Unbekannter Fehler" };
  }
}

export async function extractBestBefore(
  input: { base64: string; mimeType: string },
): Promise<ActionResult<VisionActionPayload>> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Nicht angemeldet" };

    const result = await runExtraction(parsed.data);

    if (result.ok) {
      return { ok: true, data: { ok: true, date: result.value } };
    }
    return {
      ok: true,
      data: { ok: false, reason: result.reason, detail: result.detail },
    };
  } catch (err) {
    if (err instanceof VisionProviderError) {
      return { ok: false, error: `Vision-API: ${err.message}` };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unbekannter Fehler",
    };
  }
}
