import { type NextRequest, NextResponse } from "next/server";
import { mapCategory } from "@/lib/openfoodfacts/category-map";

/**
 * GET /api/product-search?q=<term>
 *
 * Proxies the Open Food Facts Search-a-licious API, normalises the
 * response to our internal shape, and caches it for 30 minutes.
 *
 * We use search.openfoodfacts.org (Search-a-licious / Elasticsearch)
 * rather than the classic world.openfoodfacts.org/api/v2/search because:
 *   - It consistently searches German-language fields (`langs=de`)
 *   - It is more reliable and has lower latency
 *   - `sort_by=popularity_key` gives better autocomplete ordering
 *
 * This route could be moved to a Supabase Edge Function (Frankfurt) for
 * even lower latency to German users; the logic is identical.
 */

export const runtime = "edge";

export type ProductSearchResult = {
  barcode: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  category: string;
  quantity: string | null;
};

const OFF_FIELDS =
  "code,product_name,product_name_de,brands,categories_tags,image_url,quantity";

const EMPTY = NextResponse.json({ products: [] as ProductSearchResult[] });

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return EMPTY;

  // Search-a-licious API (Elasticsearch-based, stable, designed for autocomplete).
  const offUrl = new URL("https://search.openfoodfacts.org/search");
  offUrl.searchParams.set("q", q);
  offUrl.searchParams.set("langs", "de"); // search product_name.de, categories.de, …
  offUrl.searchParams.set("fields", OFF_FIELDS);
  offUrl.searchParams.set("page_size", "8");
  offUrl.searchParams.set("sort_by", "popularity_key");

  try {
    const offRes = await fetch(offUrl.toString(), {
      headers: {
        "User-Agent": "Stock-PWA/0.1 (https://github.com/TobyReith/Stock)",
      },
      // Next.js ISR cache: reuse the same OFF response for 30 min.
      // The cache key is the full URL, so each unique query is cached
      // independently.
      next: { revalidate: 1800 },
    });

    if (!offRes.ok) return EMPTY;

    // Search-a-licious returns { hits: [] }; fall back to { products: [] }
    // in case the API shape ever changes.
    const data = (await offRes.json()) as { hits?: unknown[]; products?: unknown[] };

    const products: ProductSearchResult[] = (data.hits ?? data.products ?? [])
      .map(normalizeProduct)
      .filter((p): p is ProductSearchResult => p !== null);

    return NextResponse.json(
      { products },
      {
        headers: {
          // Tell CDN/browser to cache hits for 30 min, serve stale for 1 h.
          "Cache-Control":
            "public, s-maxage=1800, stale-while-revalidate=3600",
        },
      },
    );
  } catch {
    return EMPTY;
  }
}

type RawProduct = Record<string, unknown>;

function firstBrand(brands: unknown): string | null {
  if (Array.isArray(brands)) return (brands[0] as string)?.trim() || null;
  if (typeof brands === "string") return brands.split(",")[0]?.trim() || null;
  return null;
}

function normalizeProduct(raw: unknown): ProductSearchResult | null {
  const p = raw as RawProduct;
  const name = (
    (p.product_name_de as string) ||
    (p.product_name as string) ||
    ""
  ).trim();
  if (!name || !p.code) return null;

  return {
    barcode: p.code as string,
    name,
    // Search-a-licious returns brands as string[]; OFF v2 uses a comma-joined string.
    brand: firstBrand(p.brands),
    imageUrl: (p.image_url as string) || null,
    category: mapCategory((p.categories_tags as string[]) ?? []),
    quantity: (p.quantity as string) || null,
  };
}
