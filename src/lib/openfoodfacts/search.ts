import { mapCategory } from "./category-map";

/**
 * Shared Open Food Facts search logic used by both the product-autocomplete
 * API route and the vision-enrichment pipeline.
 *
 * Why a shared module:
 *   - The API route already implemented a robust multi-query strategy with
 *     brand-wildcard Lucene queries and a `matchesAllTokens` filter. The vision
 *     pipeline previously had its own simpler single-query search, which caused
 *     products like "HEJ Vegan Protein Vanilla" to be missed.
 *   - Centralising here ensures both paths stay in sync.
 */

export type OFFSearchHit = {
  barcode: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  category: string;
  quantity: string | null;
};

const OFF_FIELDS =
  "code,product_name,product_name_de,product_name_en,brands,categories_tags,image_url,quantity";

const USER_AGENT = "Stock-PWA/0.1 (https://github.com/TobyReith/Stock)";

export const LOCALE_TO_PRIMARY_LANG: Record<string, string> = {
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

export const DEFAULT_PRIMARY_LANG = "de";

/**
 * Tokens that are safe to use inside a Lucene `field:value*` query.
 * The OFF API rejects (500) queries with reserved Lucene chars in the value
 * portion, so we only emit wildcard queries for alphanumeric tokens.
 */
export function isWildcardSafe(token: string): boolean {
  return /^[\p{L}\p{N}]+$/u.test(token);
}

/**
 * Single OFF search request. No token filtering — callers decide what to keep.
 * No `sort_by` → Elasticsearch relevance ranking surfaces exact matches first.
 */
export async function fetchOFF(
  query: string,
  pageSize: number,
  primaryLang: string,
): Promise<OFFSearchHit[]> {
  const url = new URL("https://search.openfoodfacts.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("fields", OFF_FIELDS);
  url.searchParams.set("page_size", String(pageSize));

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT },
    next: { revalidate: 1800 },
  });

  if (!res.ok) return [];

  const data = (await res.json()) as { hits?: unknown[]; products?: unknown[] };
  return (data.hits ?? data.products ?? [])
    .map((raw) => normalizeHit(raw, primaryLang))
    .filter((p): p is OFFSearchHit => p !== null);
}

type RawProduct = Record<string, unknown>;

function firstBrand(brands: unknown): string | null {
  if (Array.isArray(brands)) return (brands[0] as string)?.trim() || null;
  if (typeof brands === "string") return brands.split(",")[0]?.trim() || null;
  return null;
}

function normalizeHit(raw: unknown, primaryLang: string): OFFSearchHit | null {
  const p = raw as RawProduct;
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

/**
 * Multi-query OFF search for product autocomplete.
 *
 * Strategy (parallel):
 *   1. `brands:t1* AND brands:t2*` — combined brand wildcard (most precise)
 *   2. `brands:t0*`                — single brand wildcard for prefix match
 *   3. Full phrase query            — relevance-ranked catch-all
 *
 * Results are deduplicated and filtered to those where EVERY query token
 * appears in the combined `name + brand` text. This solves the cross-field
 * problem where brand and name are separate Elasticsearch fields.
 */
export async function searchProducts(
  q: string,
  primaryLang = DEFAULT_PRIMARY_LANG,
): Promise<OFFSearchHit[]> {
  const trimmed = q.trim();
  if (trimmed.length < 2) return [];

  const tokens = trimmed.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
  const isMultiWord = tokens.length >= 2;

  const safeTokens = tokens.filter(isWildcardSafe);
  const brandWildcardSingle = safeTokens[0] ? `brands:${safeTokens[0]}*` : null;
  const brandWildcardCombined =
    safeTokens.length >= 2
      ? safeTokens.map((t) => `brands:${t}*`).join(" AND ")
      : null;

  const requests: Promise<OFFSearchHit[]>[] = [];
  if (brandWildcardCombined) requests.push(fetchOFF(brandWildcardCombined, 25, primaryLang));
  if (brandWildcardSingle) requests.push(fetchOFF(brandWildcardSingle, 50, primaryLang));
  requests.push(fetchOFF(trimmed, isMultiWord ? 25 : 20, primaryLang));

  const resultSets = await Promise.all(requests);

  const matchesAllTokens = (p: OFFSearchHit) => {
    const haystack = `${p.name} ${p.brand ?? ""}`.toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  };

  const seen = new Set<string>();
  const out: OFFSearchHit[] = [];
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
