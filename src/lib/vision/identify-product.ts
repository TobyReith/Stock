import "server-only";
import { identifyProduct as anthropicIdentify } from "./anthropic";
import { mapCategory } from "@/lib/openfoodfacts/category-map";
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

const OFF_FIELDS = "code,product_name,product_name_de,product_name_en,brands,categories_tags,image_url";

async function searchOFF(query: string, pageSize = 5): Promise<ProductCandidate[]> {
  try {
    const url = new URL("https://search.openfoodfacts.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("fields", OFF_FIELDS);
    url.searchParams.set("page_size", String(pageSize));
    url.searchParams.set("sort_by", "popularity_key");

    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "Stock-PWA/0.1 (https://github.com/TobyReith/Stock)" },
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];

    const data = (await res.json()) as { hits?: unknown[]; products?: unknown[] };
    const items = data.hits ?? data.products ?? [];

    return (items as Record<string, unknown>[])
      .map((p): ProductCandidate | null => {
        const name = (
          (p.product_name_de as string) ||
          (p.product_name_en as string) ||
          (p.product_name as string) ||
          ""
        ).trim();
        if (!name || !p.code) return null;

        const brandsRaw = p.brands;
        let brand: string | null = null;
        if (Array.isArray(brandsRaw)) brand = (brandsRaw[0] as string)?.trim() || null;
        else if (typeof brandsRaw === "string") brand = brandsRaw.split(",")[0]?.trim() || null;

        return {
          name,
          brand,
          category: mapCategory((p.categories_tags as string[]) ?? []),
          confidence: 0.6,
          source: "off",
          offBarcode: p.code as string,
          offImageUrl: (p.image_url as string) || undefined,
        };
      })
      .filter((c): c is ProductCandidate => c !== null);
  } catch {
    return [];
  }
}

// ─── OFF match scoring ────────────────────────────────────────────────────────

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

/** Fraction of the smaller token set that appears in the other set. */
function tokenSetSimilarity(a: string, b: string): number {
  const tokA = new Set(normalizeForMatch(a).split(/\s+/).filter((t) => t.length > 1));
  const tokB = new Set(normalizeForMatch(b).split(/\s+/).filter((t) => t.length > 1));
  if (tokA.size === 0 || tokB.size === 0) return 0;
  const intersection = [...tokA].filter((t) => tokB.has(t)).length;
  return intersection / Math.min(tokA.size, tokB.size);
}

/**
 * Returns the first OFF result that matches the vision candidate by name
 * similarity, with a graduated brand check.
 *
 * Why graduated:
 *   - Consumer-facing brand ("Caotina") often differs from the manufacturer
 *     stored in OFF ("Wander AG"). A hard brand gate kills valid matches.
 *   - High name overlap (≥ 0.75) is a strong enough signal on its own.
 *   - Medium overlap (0.6–0.75) still accepts when the brand appears
 *     anywhere in the OFF product name (common packaging pattern) or the
 *     brand fields loosely match.
 */
function findBestOffMatch(
  candidate: { name: string; brand: string | null },
  offResults: ProductCandidate[],
): ProductCandidate | null {
  const normCandidateBrand = candidate.brand ? normalizeForMatch(candidate.brand) : null;

  for (const off of offResults) {
    const overlap = tokenSetSimilarity(candidate.name, off.name);
    if (overlap < 0.6) continue;

    // High name overlap → name is the dominant signal; skip brand gate.
    if (overlap >= 0.75) return off;

    // Medium overlap → require some brand corroboration.
    if (normCandidateBrand) {
      const normOffBrand = off.brand ? normalizeForMatch(off.brand) : "";
      const normOffName = normalizeForMatch(off.name);
      const brandMatch =
        normOffBrand.includes(normCandidateBrand) ||
        normCandidateBrand.includes(normOffBrand) ||
        // Brand name appears inside the product name ("Caotina Original" ⊃ "Caotina").
        normOffName.includes(normCandidateBrand);
      if (!brandMatch) continue;
    }

    return off;
  }
  return null;
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

  // Enrich every vision candidate with an OFF match (parallel requests).
  // This guarantees that even high-confidence vision results get a barcode
  // and product image when the product exists in Open Food Facts.
  const enriched = await Promise.all(
    visionCandidates.map(async (candidate): Promise<ProductCandidate> => {
      // Avoid "Brand Brand Name" when name already starts with or contains brand.
      const brand = candidate.brand ?? "";
      const query = brand && !candidate.name.toLowerCase().includes(brand.toLowerCase())
        ? `${brand} ${candidate.name}`
        : candidate.name;
      if (!query) return candidate;

      const offResults = await searchOFF(query, 5);
      const match = findBestOffMatch(candidate, offResults);

      if (!match) return candidate; // source stays "vision"

      return {
        ...candidate,
        source: "vision+off",
        offBarcode: match.offBarcode,
        offImageUrl: match.offImageUrl,
        offProductName: match.name,
        // Prefer the OFF category when the vision category was "other".
        category: candidate.category === "other" ? match.category : candidate.category,
      };
    }),
  );

  // When vision found nothing or was uncertain, also run a pure OFF text search
  // and append any results not already represented by an enriched candidate.
  const topConfidence = visionCandidates[0]?.confidence ?? 0;
  let extraOff: ProductCandidate[] = [];
  if (visionCandidates.length === 0 || topConfidence < 0.65) {
    const bestName = visionCandidates[0];
    const query = bestName
      ? [bestName.brand, bestName.name].filter(Boolean).join(" ")
      : "";
    if (query) {
      const offResults = await searchOFF(query, 5);
      const enrichedBarcodes = new Set(enriched.map((c) => c.offBarcode).filter(Boolean));
      extraOff = offResults.filter(
        (r) => r.offBarcode && !enrichedBarcodes.has(r.offBarcode),
      );
    }
  }

  const merged = [...enriched, ...extraOff].slice(0, 5);
  return { ok: true, candidates: merged };
}
