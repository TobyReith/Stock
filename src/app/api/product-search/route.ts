import { type NextRequest, NextResponse } from "next/server";
import { mapCategory } from "@/lib/openfoodfacts/category-map";

/**
 * GET /api/product-search?q=<term>
 *
 * Proxies Open Food Facts v2 search filtered to Germany, normalises the
 * response to our internal shape, and caches it for 30 minutes via ISR.
 * Running this server-side protects against OFF rate-limits and keeps the
 * raw OFF payload off the client bundle.
 *
 * This route could be moved to a Supabase Edge Function (Frankfurt) for
 * lower p50 latency to German users; the logic is identical.
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

  const offUrl = new URL("https://world.openfoodfacts.org/api/v2/search");
  offUrl.searchParams.set("search_terms", q);
  offUrl.searchParams.set("countries_tags", "en:germany");
  offUrl.searchParams.set("fields", OFF_FIELDS);
  offUrl.searchParams.set("page_size", "8");
  offUrl.searchParams.set("sort_by", "unique_scans_n");

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

    const data = (await offRes.json()) as { products?: unknown[] };

    const products: ProductSearchResult[] = (data.products ?? [])
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
    brand: ((p.brands as string) ?? "").split(",")[0]?.trim() || null,
    imageUrl: (p.image_url as string) || null,
    category: mapCategory((p.categories_tags as string[]) ?? []),
    quantity: (p.quantity as string) || null,
  };
}
