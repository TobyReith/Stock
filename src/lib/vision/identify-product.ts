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
 * Picks the best OFF hit for a vision candidate by matching name tokens
 * (excluding brand) plus a brand-consistency check.
 *
 * Scoring: `nameOverlap` is the count of non-brand name tokens shared between
 * vision and OFF. `brandOverlap` is the count of shared brand tokens. Final
 * score = nameOverlap + brandOverlap * 2.
 *
 * Rejection rules (prevent false-positive enrichment):
 *  - Zero name overlap → reject. Brand match alone is not enough — many
 *    products share a brand without being the same product (e.g. "Joghurt
 *    Ferment Mild" vs "Hirse Flocken", both by Reformhaus).
 *  - Vision has a brand AND no brand-token overlap AND name overlap < 2 →
 *    reject. Stops the OFF brand-wildcard from grabbing unrelated products
 *    that happen to share a single name word.
 */
function pickBestMatch(
  candidate: { name: string; brand: string | null },
  hits: OFFSearchHit[],
): OFFSearchHit | null {
  if (hits.length === 0) return null;

  const candidateBrandTokens = new Set(nameTokens(candidate.brand ?? ""));

  let bestHit: OFFSearchHit | null = null;
  let bestScore = 0;

  for (const hit of hits) {
    // Name overlap counts only NON-brand tokens. Otherwise a matching brand
    // would inflate the score and bypass the rejection guards below.
    const hitBrandTokens = new Set(nameTokens(hit.brand ?? ""));
    const candNameSet = new Set(
      nameTokens(candidate.name).filter((t) => !candidateBrandTokens.has(t)),
    );
    const hitNameTokensFiltered = nameTokens(hit.name).filter(
      (t) => !hitBrandTokens.has(t),
    );
    const nameOverlap = hitNameTokensFiltered.filter((t) => candNameSet.has(t)).length;
    if (nameOverlap === 0) continue;

    const brandOverlap = [...hitBrandTokens].filter((t) =>
      candidateBrandTokens.has(t),
    ).length;

    if (candidateBrandTokens.size > 0 && brandOverlap === 0 && nameOverlap < 2) {
      continue;
    }

    const score = nameOverlap + brandOverlap * 2;
    if (score > bestScore) {
      bestScore = score;
      bestHit = hit;
    }
  }

  return bestHit;
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

  // When confidence is below variant-level (< 0.85: name readable but brand/variant
  // unclear), also surface pure OFF results so the user has more candidates to choose from.
  const topConfidence = visionCandidates[0]?.confidence ?? 0;
  let extraOff: ProductCandidate[] = [];
  if (visionCandidates.length === 0 || topConfidence < 0.85) {
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
