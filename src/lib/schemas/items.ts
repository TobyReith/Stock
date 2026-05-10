import { z } from "zod";
import type { CategoryKey } from "@/lib/constants/categories";

/**
 * The `CategoryKey` enum values, duplicated as a plain string array so
 * zod can emit a useful error without forcing a runtime import of the
 * constants module from schemas (which would pull the table of labels
 * into every action that only wants to validate).
 *
 * Keep in sync with `CategoryKey` in `@/lib/constants/categories`.
 */
const CATEGORY_KEYS = [
  "dairy",
  "meat_fish",
  "produce",
  "frozen",
  "canned",
  "dry_pasta_rice",
  "dry_baking",
  "bread",
  "spices",
  "condiments",
  "snacks",
  "beverages",
  "other",
] as const satisfies readonly CategoryKey[];

export const categoryKeySchema = z.enum(CATEGORY_KEYS);

/** ISO date `YYYY-MM-DD`. Matches the Postgres `date` column on `items`. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum als YYYY-MM-DD");

export const locationSchema = z.string().min(1).max(80);
export type ItemLocation = string;

export const barcodeSchema = z
  .string()
  .regex(/^\d{6,14}$/, "Barcode muss 6–14 Ziffern haben");

export const itemCategorySchema = z.enum(["food", "hygiene", "medicine", "other"]);
export type ItemCategoryType = z.infer<typeof itemCategorySchema>;

/**
 * Input shape for the Add-Flow form. Either `productId` (existing product
 * in our cache) OR enough inline product info to create one.
 */
export const addItemSchema = z
  .object({
    // Resolve-or-create product:
    productId: z.string().uuid().optional(),
    barcode: barcodeSchema.optional(),
    productName: z.string().min(1, "Name fehlt").max(200).optional(),
    brand: z.string().max(120).optional().nullable(),
    imageUrl: z.string().url().optional().nullable(),
    /** Stored on `products.category` — should be a CategoryKey but kept as
     *  string to avoid a circular import; validated at the action layer. */
    category: z.string().max(40).optional(),

    // Item-specific fields:
    itemCategory: itemCategorySchema.default("food"),
    customName: z.string().max(200).optional(),
    quantity: z.coerce.number().positive("Menge muss > 0 sein").default(1),
    unit: z.string().max(20).optional(),
    bestBefore: isoDate,
    location: locationSchema,
    note: z.string().max(500).optional(),
  })
  .refine((v) => Boolean(v.productId) || Boolean(v.productName), {
    message: "Produktname oder bekanntes Produkt erforderlich",
    path: ["productName"],
  });

export type AddItemInput = z.infer<typeof addItemSchema>;

/**
 * Input for `updateItem`.
 *
 * Fields on the global `products` row remain immutable (ADR-0002). For
 * the "Open Food Facts returned rubbish" case we allow per-item
 * overrides: `customName` (existed since Phase 1), `customBrand` and
 * `customCategory` (added in Phase 2.4). Readers coalesce
 * `items.custom_* -> products.*`.
 */
export const updateItemSchema = z.object({
  id: z.string().uuid(),
  customName: z.string().max(200).nullable().optional(),
  customBrand: z.string().max(120).nullable().optional(),
  customCategory: z.string().max(80).nullable().optional(),
  quantity: z.coerce.number().positive().optional(),
  unit: z.string().max(20).nullable().optional(),
  bestBefore: isoDate.optional(),
  location: locationSchema.optional(),
  note: z.string().max(500).nullable().optional(),
  frozenAt: isoDate.nullable().optional(),
});

export type UpdateItemInput = z.infer<typeof updateItemSchema>;

export const itemIdSchema = z.string().uuid();
