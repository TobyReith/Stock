import "server-only";
import { identifyProduct as anthropicIdentify } from "./anthropic";
import { fetchProductByBarcode, OFFNotFoundError } from "@/lib/openfoodfacts/client";
import { fetchOFF, isWildcardSafe } from "@/lib/openfoodfacts/search";
import type { OFFSearchHit } from "@/lib/openfoodfacts/search";
import type { ProductCandidate, ProductIdentificationResult, VisionInput } from "./types";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set<VisionInput["mimeType"]>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function approxDecodedSize(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

// ─── Matching helpers ─────────────────────────────────────────────────────────

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

function nameTokens(s: string): string[] {
  return normalizeForMatch(s).split(/\s+/).filter((t) => t.length > 1);
}

/** Count tokens shared between two strings (case/diacritic insensitive). */
function sharedTokenCount(a: string, b: string): number {
  const tokA = new Set(nameTokens(a));
  return nameTokens(b).filter((t) => tokA.has(t)).length;
}

// ─── OFF search for vision ────────────────────────────────────────────────────

/**
 * Fetches OFF candidates for a vision-identified product using two parallel
 * strategies, then merges the results (deduped by barcode):
 *
 *  1. Brand-wildcard (`brands:<token>*`, pageSize=20):
 *     Returns all products of this brand so we can pick the closest by name.
 *     This is the key improvement over a single phrase query — even if the
 *     vision name deviates from the OFF entry (e.g. "fret Classic" vs
 *     "Kägi fret"), we still surface the right candidate from the brand set.
 *
 *  2. Phrase query (`<brand> <name>`, pageSize=10):
 *     Relevance-ranked fallback for brands without a clean wildcard token,
 *     and for catching cross-brand products.
 */
async function searchOFFForVision(
  brand: string | null,
  name: string,
): Promise<OFFSearchHit[]> {
  const requests: Promise<OFFSearchHit[]>[] = [];

  if (brand) {
    const brandToken = brand
      .toLowerCase()
      .split(/\s+/)
      .find((t) => t.length >= 2 && isWildcardSafe(t));
    if (brandToken) {
      requests.push(fetchOFF(`brands:${brandToken}*`, 20, "de"));
    }
  }

  const phraseQuery =
    brand && !name.toLowerCase().includes(brand.toLowerCase())
      ? `${brand} ${name}`
      : name;
  requests.push(fetchOFF(phraseQuery, 10, "de"));

  const resultSets = await Promise.all(requests);

  const seen = new Set<string>();
  const all: OFFSearchHit[] = [];
  for (const set of resultSets) {
    for (const hit of set) {
      if (seen.has(hit.barcode)) continue;
      seen.add(hit.barcode);
      all.push(hit);
    }
  }
  return all;
}

/**
 * Picks the best OFF hit for a vision candidate by maximising shared name
 * tokens. Two passes are scored and the max is taken:
 *
 *  - vision name      vs OFF name            (primary)
 *  - vision brand+name vs OFF name+brand     (catches "fret Classic" / brand "Kägi"
 *                                             vs OFF "Kägi fret")
 *
 * Requires at least one shared non-trivial token (> 1 char). When the brand-
 * wildcard returns many products (all same brand) the highest-scoring name
 * match wins without any extra threshold.
 */
function pickBestMatch(
  candidate: { name: string; brand: string | null },
  hits: OFFSearchHit[],
): OFFSearchHit | null {
  if (hits.length === 0) return null;

  const candidateFull = candidate.brand
    ? `${candidate.brand} ${candidate.name}`
    : candidate.name;

  let bestHit: OFFSearchHit | null = null;
  let bestScore = 0;

  for (const hit of hits) {
    const scoreA = sharedTokenCount(candidate.name, hit.name);
    const scoreB = sharedTokenCount(candidateFull, `${hit.name} ${hit.brand ?? ""}`);
    const score = Math.max(scoreA, scoreB);
    if (score > bestScore) {
      bestScore = score;
      bestHit = hit;
    }
  }

  return bestScore > 0 ? bestHit : null;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function identifyProduct(input: VisionInput): Promise<ProductIdentificationResult> {
  if (!ALLOWED_MIME.has(input.mimeType)) {
    return { ok: false, reason: "rejected" };
  }
  if (approxDecodedSize(input.base64) > MAX_IMAGE_BYTES) {
    return { ok: false, reason: "rejected" };
  }

  const visionResult = await anthropicIdentify(input);
  if (!visionResult.ok) return visionResult;

  const visionCandidates = visionResult.candidates;

  const enriched = await Promise.all(
    visionCandidates.map(async (candidate): Promise<ProductCandidate> => {
      // Fast path: if the vision AI read a barcode from the photo, look it up
      // directly — perfect match, no text-search ambiguity.
      if (candidate.visionBarcode) {
        try {
          const product = await fetchProductByBarcode(candidate.visionBarcode);
          return {
            ...candidate,
            source: "vision+off",
            offBarcode: product.barcode,
            offImageUrl: product.imageUrl ?? undefined,
            offProductName: product.name,
            category: candidate.category === "other" ? product.category : candidate.category,
          };
        } catch (err) {
          if (!(err instanceof OFFNotFoundError)) throw err;
          // Barcode not in OFF — fall through to text search.
        }
      }

      const hits = await searchOFFForVision(candidate.brand, candidate.name);
      const match = pickBestMatch(candidate, hits);

      if (!match) return candidate;

      return {
        ...candidate,
        source: "vision+off",
        offBarcode: match.barcode,
        offImageUrl: match.imageUrl ?? undefined,
        offProductName: match.name,
        category: candidate.category === "other" ? match.category : candidate.category,
      };
    }),
  );

  // When vision confidence is low, also surface pure OFF results so the user
  // has more candidates to choose from.
  const topConfidence = visionCandidates[0]?.confidence ?? 0;
  let extraOff: ProductCandidate[] = [];
  if (visionCandidates.length === 0 || topConfidence < 0.65) {
    const best = visionCandidates[0];
    if (best) {
      const hits = await searchOFFForVision(best.brand, best.name);
      const enrichedBarcodes = new Set(enriched.map((c) => c.offBarcode).filter(Boolean));
      extraOff = hits
        .filter((h) => !enrichedBarcodes.has(h.barcode))
        .slice(0, 5)
        .map((h): ProductCandidate => ({
          name: h.name,
          brand: h.brand,
          category: h.category,
          confidence: 0.6,
          source: "off",
          offBarcode: h.barcode,
          offImageUrl: h.imageUrl ?? undefined,
        }));
    }
  }

  const merged = [...enriched, ...extraOff].slice(0, 5);
  return { ok: true, candidates: merged };
}
