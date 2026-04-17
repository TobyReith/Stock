/**
 * Smart defaults for best-before-date (MHD) estimation when the user skips
 * the MHD photo / OCR. Values are "safe-ish" rules of thumb based on typical
 * German household shelf life — not nutrition-certified.
 *
 * Used by:
 *   - Add-Flow fallback (PR 1.5) when no MHD is detected
 *   - Open Food Facts category mapping (PR 1.2)
 *
 * Keep the key set stable; the DB column `products.category` stores these keys.
 */

export type CategoryKey =
  | "dairy"
  | "meat_fish"
  | "produce"
  | "frozen"
  | "canned"
  | "dry_pasta_rice"
  | "dry_baking"
  | "bread"
  | "spices"
  | "condiments"
  | "snacks"
  | "beverages"
  | "other";

export type Category = {
  key: CategoryKey;
  label: string;
  /** Default shelf life if we have nothing else. In days. */
  defaultShelfLifeDays: number;
  /** Typical storage location for this category. */
  defaultLocation: "fridge" | "pantry" | "freezer" | "other";
};

export const CATEGORIES: readonly Category[] = [
  { key: "dairy",          label: "Milch & Käse",       defaultShelfLifeDays: 7,   defaultLocation: "fridge" },
  { key: "meat_fish",      label: "Fleisch & Fisch",    defaultShelfLifeDays: 3,   defaultLocation: "fridge" },
  { key: "produce",        label: "Obst & Gemüse",      defaultShelfLifeDays: 7,   defaultLocation: "fridge" },
  { key: "frozen",         label: "Tiefkühl",           defaultShelfLifeDays: 180, defaultLocation: "freezer" },
  { key: "canned",         label: "Konserven",          defaultShelfLifeDays: 730, defaultLocation: "pantry" },
  { key: "dry_pasta_rice", label: "Nudeln & Reis",      defaultShelfLifeDays: 730, defaultLocation: "pantry" },
  { key: "dry_baking",     label: "Mehl & Zucker",      defaultShelfLifeDays: 365, defaultLocation: "pantry" },
  { key: "bread",          label: "Brot & Backwaren",   defaultShelfLifeDays: 5,   defaultLocation: "pantry" },
  { key: "spices",         label: "Gewürze",            defaultShelfLifeDays: 730, defaultLocation: "pantry" },
  { key: "condiments",     label: "Saucen & Öl",        defaultShelfLifeDays: 365, defaultLocation: "pantry" },
  { key: "snacks",         label: "Snacks & Süßes",     defaultShelfLifeDays: 180, defaultLocation: "pantry" },
  { key: "beverages",      label: "Getränke",           defaultShelfLifeDays: 365, defaultLocation: "pantry" },
  { key: "other",          label: "Sonstiges",          defaultShelfLifeDays: 90,  defaultLocation: "pantry" },
] as const;

const byKey = new Map<CategoryKey, Category>(CATEGORIES.map((c) => [c.key, c]));

export function getCategory(key: CategoryKey | null | undefined): Category {
  if (!key) return byKey.get("other")!;
  return byKey.get(key) ?? byKey.get("other")!;
}

/**
 * Given today's date and a category, compute the fallback best-before date.
 * Returns an ISO date string (YYYY-MM-DD).
 */
export function defaultBestBeforeDate(
  category: CategoryKey | null | undefined,
  today: Date = new Date(),
): string {
  const { defaultShelfLifeDays } = getCategory(category);
  const d = new Date(today);
  d.setDate(d.getDate() + defaultShelfLifeDays);
  return d.toISOString().slice(0, 10);
}
