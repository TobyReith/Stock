import { z } from "zod";
import type { CategoryKey } from "@/lib/constants/categories";
import type { ItemCategoryType } from "@/lib/schemas/items";
import { mapCategory, mapItemCategory } from "./category-map";

/**
 * Open Food Facts API v2 client.
 * Docs: https://openfoodfacts.github.io/openfoodfacts-server/api/
 *
 * Errors are typed so callers can branch on `OFFNotFoundError` (no result)
 * vs. `OFFFetchError` (network / parse / HTTP failure).
 */

const FIELDS = [
  "code",
  "product_name",
  "product_name_de",
  "brands",
  "categories_tags",
  "image_url",
  "quantity",
] as const;

const USER_AGENT = "Stock-PWA/0.1 (https://github.com/TobyReith/Stock)";
const REQUEST_TIMEOUT_MS = 5000;

const productSchema = z.object({
  code: z.string(),
  product_name: z.string().optional(),
  product_name_de: z.string().optional(),
  brands: z.string().optional(),
  categories_tags: z.array(z.string()).optional(),
  image_url: z.string().optional(),
  quantity: z.string().optional(),
});

const responseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal(1), product: productSchema }),
  z.object({ status: z.literal(0), status_verbose: z.string().optional() }),
]);

export type OFFProduct = {
  barcode: string;
  name: string;
  brand: string | null;
  category: CategoryKey;
  itemCategory: ItemCategoryType;
  imageUrl: string | null;
  quantity: string | null;
  /** Raw response, persisted to `products.off_data` for future reprocessing. */
  raw: unknown;
};

export class OFFNotFoundError extends Error {
  readonly barcode: string;
  constructor(barcode: string) {
    super(`Produkt nicht in Open Food Facts gefunden: ${barcode}`);
    this.name = "OFFNotFoundError";
    this.barcode = barcode;
  }
}

export class OFFFetchError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "OFFFetchError";
  }
}

/** Validate barcode shape: digits only, 6–14 chars (covers EAN-8/12/13/14). */
const barcodeSchema = z.string().regex(/^\d{6,14}$/, "Ungültiges Barcode-Format");

export async function fetchProductByBarcode(barcode: string): Promise<OFFProduct> {
  const validated = barcodeSchema.parse(barcode);
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(
    validated,
  )}.json?fields=${FIELDS.join(",")}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      // Cache successful lookups for 24h on the Next.js fetch layer.
      next: { revalidate: 60 * 60 * 24 },
    });
  } catch (err) {
    throw new OFFFetchError("Open Food Facts nicht erreichbar", { cause: err });
  }

  if (!res.ok) {
    if (res.status === 404) {
      throw new OFFNotFoundError(validated);
    }
    throw new OFFFetchError(`Open Food Facts: HTTP ${res.status}`);
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch (err) {
    throw new OFFFetchError("Antwort von Open Food Facts war kein JSON", { cause: err });
  }

  const parsed = responseSchema.safeParse(data);
  if (!parsed.success) {
    throw new OFFFetchError(`Unerwartete Antwort: ${parsed.error.message}`);
  }

  if (parsed.data.status === 0) {
    throw new OFFNotFoundError(validated);
  }

  const p = parsed.data.product;
  const name =
    p.product_name_de?.trim() ||
    p.product_name?.trim() ||
    "Unbekanntes Produkt";
  const brand = p.brands?.split(",")[0]?.trim() || null;

  return {
    barcode: p.code,
    name,
    brand,
    category: mapCategory(p.categories_tags ?? []),
    itemCategory: mapItemCategory(p.categories_tags ?? []),
    imageUrl: p.image_url?.trim() || null,
    quantity: p.quantity?.trim() || null,
    raw: p,
  };
}
