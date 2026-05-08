import { type NextRequest, NextResponse } from "next/server";
import {
  searchProducts,
  LOCALE_TO_PRIMARY_LANG,
  DEFAULT_PRIMARY_LANG,
} from "@/lib/openfoodfacts/search";

/**
 * GET /api/product-search?q=<term>
 *
 * Proxies the Open Food Facts Search-a-licious API, normalises the
 * response to our internal shape, and caches it for 30 minutes.
 *
 * Search strategy, language handling, and token filtering live in
 * `src/lib/openfoodfacts/search.ts` (shared with the vision pipeline).
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

const EMPTY = NextResponse.json({ products: [] as ProductSearchResult[] });

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return EMPTY;

  const locale = req.nextUrl.searchParams.get("locale") ?? "de";
  const primaryLang = LOCALE_TO_PRIMARY_LANG[locale] ?? DEFAULT_PRIMARY_LANG;

  try {
    const products = await searchProducts(q, primaryLang);

    return NextResponse.json(
      { products },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=1800, stale-while-revalidate=3600",
        },
      },
    );
  } catch {
    return EMPTY;
  }
}
