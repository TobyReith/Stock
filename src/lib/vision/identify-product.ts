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

const OFF_FIELDS = "code,product_name,product_name_de,brands,categories_tags,image_url";

async function searchOFF(query: string): Promise<ProductCandidate[]> {
  try {
    const url = new URL("https://search.openfoodfacts.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("langs", "de");
    url.searchParams.set("fields", OFF_FIELDS);
    url.searchParams.set("page_size", "5");
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
  const topConfidence = visionCandidates[0]?.confidence ?? 0;

  // Trigger OFF fallback when vision is uncertain or found nothing.
  let offCandidates: ProductCandidate[] = [];
  if (visionCandidates.length === 0 || topConfidence < 0.65) {
    const bestName = visionCandidates[0];
    const query = bestName
      ? [bestName.brand, bestName.name].filter(Boolean).join(" ")
      : "";
    if (query) offCandidates = await searchOFF(query);
  }

  const merged = [...visionCandidates, ...offCandidates].slice(0, 5);
  return { ok: true, candidates: merged };
}
