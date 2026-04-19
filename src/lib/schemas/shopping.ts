import { z } from "zod";

/**
 * Validation for the shopping-list server actions.
 *
 * Mirrors `items.ts` style: one schema per action input, inferred types
 * re-exported for forms / callers. Kept separate from `items.ts` because
 * the shapes genuinely diverge — shopping-list rows are sparser
 * (quantity + unit optional, no MHD, no location).
 */

/**
 * Create a new shopping-list entry.
 *
 * Either a product reference OR a custom name must be present — this
 * matches the DB-level check constraint. The `.refine` duplicates that
 * check at the app layer so the error surfaces as a nice message before
 * the round-trip, not as a cryptic Postgres `violates check constraint`.
 */
export const addShoppingItemSchema = z
  .object({
    productId: z.string().uuid().optional(),
    customName: z.string().trim().max(200).optional(),
    quantity: z.coerce.number().positive("Menge muss > 0 sein").optional(),
    unit: z.string().trim().max(20).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine(
    (v) => Boolean(v.productId) || (v.customName && v.customName.length > 0),
    {
      message: "Produkt oder Name erforderlich",
      path: ["customName"],
    },
  );

export type AddShoppingItemInput = z.infer<typeof addShoppingItemSchema>;

export const shoppingItemIdSchema = z.string().uuid();
