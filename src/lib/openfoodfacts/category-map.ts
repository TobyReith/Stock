import type { CategoryKey } from "@/lib/constants/categories";
import type { ItemCategoryType } from "@/lib/schemas/items";

/**
 * Map Open Food Facts `categories_tags` (e.g. `["en:dairies","en:cheeses"]`)
 * to our internal {@link CategoryKey}. First matching rule wins.
 *
 * Order is important — put more specific patterns above more generic ones.
 * Patterns are substring-matched against the language-stripped tag, so
 * `en:fresh-fruits` becomes `fresh-fruits` and matches `fruits`.
 */
const RULES: ReadonlyArray<{ key: CategoryKey; patterns: readonly string[] }> = [
  // Frozen and canned win over more specific food categories.
  { key: "frozen", patterns: ["frozen-foods", "produits-surgeles", "tiefkuhl"] },
  { key: "canned", patterns: ["canned-foods", "conserves", "konserven"] },

  // Animal products.
  { key: "dairy", patterns: ["dairies", "milks", "cheeses", "fromage", "yogurts", "yoghurts", "joghurt", "kase", "milch", "butter", "cream", "sahne"] },
  { key: "meat_fish", patterns: ["meats", "viandes", "fleisch", "poultry", "fishes", "seafood", "fruits-de-mer"] },

  // Plant fresh.
  { key: "produce", patterns: ["fruits", "vegetables", "legumes", "fresh-vegetables", "fresh-fruits", "obst", "gemuse"] },

  // Bakery.
  { key: "bread", patterns: ["breads", "pains", "brot", "bakery-products"] },

  // Dry pantry staples.
  { key: "dry_pasta_rice", patterns: ["pastas", "rices", "pates-alimentaires", "cereal-grains", "nudeln", "reis"] },
  { key: "dry_baking", patterns: ["flours", "sugars", "baking-mixtures", "mehl", "zucker"] },

  // Flavor.
  { key: "spices", patterns: ["spices", "epices", "herbs", "gewurze"] },
  { key: "condiments", patterns: ["sauces", "oils", "vinegars", "huiles", "saucen"] },

  // Snacks and sweets — pates-a-tartiner covers e.g. Nutella.
  { key: "snacks", patterns: ["snacks", "biscuits-and-cakes", "chocolates", "candies", "sweet-snacks", "pates-a-tartiner", "spreads", "cookies", "kekse", "schokolade"] },

  // Drinks last to avoid stealing e.g. dairy-drinks.
  { key: "beverages", patterns: ["beverages", "boissons", "waters", "juices", "getranke", "wasser", "saft"] },
];

/** Strip a `xx:` or `xxx:` language prefix from an OFF tag. */
function normalizeTag(tag: string): string {
  return tag.replace(/^[a-z]{2,3}:/, "").toLowerCase();
}

const HYGIENE_PATTERNS = [
  "tissues", "paper-handkerchiefs", "hygiene-articles", "hygiene",
  "cosmetics", "soaps", "shampoos", "dental-care", "oral-hygiene",
  "toothpastes", "mouthwashes", "deodorants", "skincare", "body-care",
  "hair-care", "feminine-hygiene", "cleaning-products", "detergents",
  "laundry", "paper-products", "razors", "shaving",
] as const;

const MEDICINE_PATTERNS = [
  "dietary-supplements", "food-supplements", "vitamins", "minerals",
  "medicines", "medicaments", "health-products", "nasal", "wound-care",
  "bandages", "eye-care", "ear-care", "pain-relief", "cold-remedies",
  "thermometers", "medical-devices",
] as const;

export function mapItemCategory(tags: readonly string[]): ItemCategoryType {
  const normalized = tags.map(normalizeTag);
  for (const tag of normalized) {
    if (MEDICINE_PATTERNS.some((p) => tag.includes(p))) return "medicine";
  }
  for (const tag of normalized) {
    if (HYGIENE_PATTERNS.some((p) => tag.includes(p))) return "hygiene";
  }
  return "food";
}

export function mapCategory(tags: readonly string[]): CategoryKey {
  if (tags.length === 0) return "other";

  for (const rawTag of tags) {
    const tag = normalizeTag(rawTag);
    for (const rule of RULES) {
      if (rule.patterns.some((p) => tag.includes(p))) {
        return rule.key;
      }
    }
  }
  return "other";
}
