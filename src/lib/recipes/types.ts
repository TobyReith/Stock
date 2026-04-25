export type RecipeIngredient = {
  name: string;
  amount: number;
  unit: string;
  isExpiringItem: boolean;
  isInPantry: boolean;
  matchedItemId?: string;
};

export type Recipe = {
  title: string;
  description: string;
  timeMinutes: number;
  difficulty: "einfach" | "mittel" | "anspruchsvoll";
  servings: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  expiringItemsUsed: string[];
  dietaryCompliance: string[];
  feasibility: "vollständig" | "limited";
  limitedNote?: string;
};

export type RecipeSuggestionResult =
  | { ok: true; recipes: Recipe[]; fromCache: boolean }
  | { ok: false; reason: "quota_exceeded" | "no_expiring_items" | "error"; message?: string };

/** Expiring pantry item passed to the LLM. */
export type ExpiringItem = {
  id: string;
  name: string;
  brand?: string;
  quantity: number;
  unit: string;
  daysLeft: number;
};

/** Non-expiring pantry item used as context. */
export type PantryItem = {
  name: string;
  category: string;
  quantity: number;
  unit: string;
};

export type UserRecipeSettings = {
  expiryThresholdDays: number;
  dietaryPreferences: string[];
  dislikedIngredients: string[];
};

export type RecipeFavorite = {
  id: string;
  recipeTitle: string;
  recipeData: Recipe;
  sourceSuggestionId?: string;
  tags: string[];
  notes?: string;
  cookedCount: number;
  lastCookedAt?: string;
  createdAt: string;
};
