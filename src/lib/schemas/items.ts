import { z } from "zod";

/** ISO date `YYYY-MM-DD`. Matches the Postgres `date` column on `items`. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum als YYYY-MM-DD");

export const locationSchema = z.enum(["fridge", "pantry", "freezer", "other"]);
export type ItemLocation = z.infer<typeof locationSchema>;

export const barcodeSchema = z
  .string()
  .regex(/^\d{6,14}$/, "Barcode muss 6–14 Ziffern haben");

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

/** Input for `updateItem`. All product-side fields are immutable from here. */
export const updateItemSchema = z.object({
  id: z.string().uuid(),
  customName: z.string().max(200).nullable().optional(),
  quantity: z.coerce.number().positive().optional(),
  unit: z.string().max(20).nullable().optional(),
  bestBefore: isoDate.optional(),
  location: locationSchema.optional(),
  note: z.string().max(500).nullable().optional(),
});

export type UpdateItemInput = z.infer<typeof updateItemSchema>;

export const itemIdSchema = z.string().uuid();
