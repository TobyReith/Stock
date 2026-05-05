import { type NextRequest, NextResponse } from "next/server";
import { mapCategory } from "@/lib/openfoodfacts/category-map";

/**
 * GET /api/product-search?q=<term>
 *
 * Proxies the Open Food Facts Search-a-licious API, normalises the
 * response to our internal shape, and caches it for 30 minutes.
 *
 * ## Language handling
 *
 * We do NOT send the `langs` API parameter. Restricting the search to
 * language-specific subfields (e.g. `product_name_de`) causes many
 * German-market products to be missed: Ritter Sport, Milka, Oatly etc.
 * were first entered in OFF by users in other countries and store their
 * name only in the generic `product_name` field — not in `product_name_de`.
 * Sending `langs=de` would make those products invisible.
 *
 * Instead, `normalizeProduct` applies a soft preference:
 * `product_name_de` → `product_name_en` → generic `product_name`.
 * German names are shown when available; international products fall back
 * to their English or original-language name.
 *
 * ## Multi-word search strategy
 *
 * Single-word: one request, top 20 by popularity.
 *
 * Multi-word ("Vly Barista"): full-phrase search + one request per
 * token in parallel. All results are filtered to those where EVERY
 * token appears somewhere in the combined `name + brand` text. Solves
 * the cross-field problem where brand and product name are separate
 * Elasticsearch fields and a plain phrase query misses both.
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
  "code,product_name,product_name_de,product_name_en,brands,categories_tags,image_url,quantity";

const EMPTY = NextResponse.json({ products: [] as ProductSearchResult[] });

/**
 * Primary language code per locale — used to pick the right
 * `product_name_<lang>` field when normalising results.
 * The `langs` API parameter is intentionally NOT sent: restricting
 * the search to language-specific subfields misses many products
 * (e.g. Ritter Sport, Milka) whose OFF entry only has a name in the
 * generic `product_name` field. Instead we let the API search all
 * language subfields and pick the best name in normalizeProduct.
 */
const LOCALE_TO_PRIMARY_LANG: Record<string, string> = {
  de: "de",
  at: "de",
  ch: "de",
  fr: "fr",
  en: "en",
  nl: "nl",
  pl: "pl",
  it: "it",
  es: "es",
};

const DEFAULT_PRIMARY_LANG = "de";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return EMPTY;

  const locale = req.nextUrl.searchParams.get("locale") ?? "de";
  const primaryLang = LOCALE_TO_PRIMARY_LANG[locale] ?? DEFAULT_PRIMARY_LANG;

  const tokens = q
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  const isMultiWord = tokens.length >= 2;

  try {
    const products = await runSearch(q, tokens, isMultiWord, primaryLang);

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

/**
 * Tokens that are safe to use inside a Lucene field:value* query.
 * The OFF API rejects (500) queries with reserved Lucene chars in the
 * value portion, so we only emit wildcard queries for alphanumeric
 * tokens. Diacritics are kept (Caotin*, Müller*).
 */
function isWildcardSafe(token: string): boolean {
  return /^[\p{L}\p{N}]+$/u.test(token);
}

async function runSearch(
  q: string,
  tokens: string[],
  isMultiWord: boolean,
  primaryLang: string,
): Promise<ProductSearchResult[]> {
  // Build a Lucene `brands:tokenN*` wildcard query for prefix matching
  // on the brand field. The OFF API only honours wildcards when scoped
  // to a specific field — bare `*` in `q` is treated as literal text.
  // This lets us find products by partial brand name (`Caotin` →
  // Caotina, `Andechs` → Andechser) which the default analyzer can't.
  const safeTokens = tokens.filter(isWildcardSafe);
  const brandWildcardSingle = safeTokens[0]
    ? `brands:${safeTokens[0]}*`
    : null;
  const brandWildcardCombined =
    safeTokens.length >= 2
      ? safeTokens.map((t) => `brands:${t}*`).join(" AND ")
      : null;

  // For multi-word queries we also do a full-phrase search — relevance
  // ranking handles cross-field matches like "Vly Barista" well.
  // Order in the merged list: combined brand wildcard first (most
  // precise), then single-brand wildcard, then full-phrase. This
  // promotes correctly-structured entries (brand=Milka, name=Daim)
  // over malformed ones (brand=Daim, name=Milka).
  const requests: Promise<ProductSearchResult[]>[] = [];
  if (brandWildcardCombined) {
    requests.push(fetchOFF(brandWildcardCombined, 25, primaryLang));
  }
  if (brandWildcardSingle) {
    requests.push(fetchOFF(brandWildcardSingle, 50, primaryLang));
  }
  requests.push(fetchOFF(q, isMultiWord ? 25 : 20, primaryLang));

  const resultSets = await Promise.all(requests);

  // Keep only results where every token appears in name + brand
  // combined. Substring match — handles partial last token (e.g. "Dai"
  // matches "Daim" because "daim".includes("dai") === true).
  const matchesAllTokens = (p: ProductSearchResult) => {
    const haystack = `${p.name} ${p.brand ?? ""}`.toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  };

  const seen = new Set<string>();
  const out: ProductSearchResult[] = [];
  for (const set of resultSets) {
    for (const p of set) {
      if (!matchesAllTokens(p)) continue;
      if (seen.has(p.barcode)) continue;
      seen.add(p.barcode);
      out.push(p);
    }
  }
  return out;
}

async function fetchOFF(
  query: string,
  pageSize: number,
  primaryLang: string,
): Promise<ProductSearchResult[]> {
  const url = new URL("https://search.openfoodfacts.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("fields", OFF_FIELDS);
  url.searchParams.set("page_size", String(pageSize));
  // No `sort_by` → Elasticsearch ranks by `_score` (relevance).
  // Sorting by `popularity_key` was breaking cross-product searches:
  // for "Milka Daim", popular Milka- and Daim-only products buried the
  // actual Milka Daim cross-products beyond page_size, so the
  // matchesAllTokens filter rejected everything. Relevance sorting
  // surfaces the correct cross-product matches at the top.

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "Stock-PWA/0.1 (https://github.com/TobyReith/Stock)",
    },
    next: { revalidate: 1800 },
  });

  if (!res.ok) return [];

  const data = (await res.json()) as { hits?: unknown[]; products?: unknown[] };
  return (data.hits ?? data.products ?? [])
    .map((raw) => normalizeProduct(raw, primaryLang))
    .filter((p): p is ProductSearchResult => p !== null);
}


type RawProduct = Record<string, unknown>;

function firstBrand(brands: unknown): string | null {
  if (Array.isArray(brands)) return (brands[0] as string)?.trim() || null;
  if (typeof brands === "string") return brands.split(",")[0]?.trim() || null;
  return null;
}

function normalizeProduct(
  raw: unknown,
  primaryLang: string,
): ProductSearchResult | null {
  const p = raw as RawProduct;

  // Name priority: locale-specific (e.g. product_name_de) →
  // English fallback → generic product_name field.
  const namePrimary = (p[`product_name_${primaryLang}`] as string | undefined)?.trim();
  const nameEn = (p.product_name_en as string | undefined)?.trim();
  const nameAny = (p.product_name as string | undefined)?.trim();

  const name = namePrimary || nameEn || nameAny || "";
  if (!name || !p.code) return null;

  return {
    barcode: p.code as string,
    name,
    brand: firstBrand(p.brands),
    imageUrl: (p.image_url as string) || null,
    category: mapCategory((p.categories_tags as string[]) ?? []),
    quantity: (p.quantity as string) || null,
  };
}
