import type { PantryItem, RecipeIngredient } from "./types";

/** Map of category slugs to related keywords for semantic boosting. */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  dry_baking:      ["mehl", "zucker", "backpulver", "hefe", "stärke", "vanille", "kakao"],
  dry_pasta_rice:  ["nudel", "pasta", "reis", "spaghetti", "penne", "rigatoni"],
  dairy:           ["milch", "sahne", "butter", "käse", "joghurt", "quark", "rahm"],
  condiments:      ["öl", "essig", "senf", "ketchup", "soße", "sauce", "mayo"],
  spices:          ["salz", "pfeffer", "paprika", "curry", "zimt", "oregano", "basilikum"],
  canned:          ["tomate", "bohne", "erbse", "linse", "mais", "thunfisch"],
  beverages:       ["wasser", "brühe", "wein", "bier", "saft"],
  produce:         ["zwiebel", "knoblauch", "kartoffel", "möhre", "karotte", "paprika", "zucchini", "spinat"],
  snacks:          ["nuss", "mandel", "haselnuss", "cashew"],
  frozen:          ["tiefkühl", "gefroren"],
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9\s]/g, "").trim();
}

/**
 * Match a recipe ingredient name against the pantry.
 * Returns the best-matching item or null if no reasonable match found.
 */
export function matchIngredientToPantry(
  ingredientName: string,
  pantryItems: PantryItem[],
): PantryItem | null {
  const normIngredient = normalize(ingredientName);
  if (!normIngredient) return null;

  let bestMatch: PantryItem | null = null;
  let bestScore = 0;

  for (const item of pantryItems) {
    const normItem = normalize(item.name);
    let score = 0;

    // Exact substring match (ingredient in item name or vice versa).
    if (normItem.includes(normIngredient) || normIngredient.includes(normItem)) {
      score += 10;
    } else {
      // Token overlap.
      const tokIngr = normIngredient.split(/\s+/).filter((t) => t.length > 2);
      const tokItem = normItem.split(/\s+/).filter((t) => t.length > 2);
      const overlap = tokIngr.filter((t) => tokItem.some((ti) => ti.includes(t) || t.includes(ti))).length;
      if (overlap > 0) score += overlap * 3;
    }

    // Category keyword boost.
    const keywords = CATEGORY_KEYWORDS[item.category] ?? [];
    if (keywords.some((kw) => normIngredient.includes(kw) || kw.includes(normIngredient))) {
      score += 2;
    }

    if (score > bestScore && score >= 3) {
      bestScore = score;
      bestMatch = item;
    }
  }

  return bestMatch;
}

/**
 * Enrich recipe ingredients with pantry availability after receiving them
 * from the LLM. Mutates `ingredients` in place.
 */
export function enrichWithPantryInfo(
  ingredients: RecipeIngredient[],
  pantryItems: PantryItem[],
  expiringItemNames: string[],
): void {
  const normExpiring = expiringItemNames.map(normalize);

  for (const ing of ingredients) {
    const normIng = normalize(ing.name);
    // Mark as expiring if the name matches any expiring item.
    ing.isExpiringItem = normExpiring.some(
      (n) => n.includes(normIng) || normIng.includes(n),
    );
    const match = matchIngredientToPantry(ing.name, pantryItems);
    ing.isInPantry = match !== null || ing.isExpiringItem;
  }
}
