"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { ChefHat, CheckCircle2, Clock, Heart, Loader2, Plus, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  generateRecipeSuggestions,
  type CookedIngredient,
} from "@/lib/actions/recipes";
import { addShoppingItem } from "@/lib/actions/shopping";
import type { Recipe, RecipeIngredient, UserRecipeSettings } from "@/lib/recipes/types";
import { CookingModal } from "./cooking-modal";

const DAILY_QUOTA = 10;
const STORAGE_KEY_RECIPES = "stock:recipes";
const STORAGE_KEY_FAVORITES = "stock:recipe-favorites";

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

type ExpiringChip = { id: string; name: string; daysLeft: number };

type Props = {
  expiringChips: ExpiringChip[];
  quotaUsed: number;
  settings: UserRecipeSettings;
};

export function RecipeSuggestions({ expiringChips, quotaUsed, settings }: Props) {
  const [recipes, setRecipesState] = useState<Recipe[]>(() =>
    loadFromStorage<Recipe[]>(STORAGE_KEY_RECIPES, []),
  );
  const [favorites, setFavoritesState] = useState<Set<string>>(() => {
    const arr = loadFromStorage<string[]>(STORAGE_KEY_FAVORITES, []);
    return new Set(arr);
  });
  const [fromCache, setFromCache] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noExpiring, setNoExpiring] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [currentQuotaUsed, setCurrentQuotaUsed] = useState(quotaUsed);
  const [cookingRecipe, setCookingRecipe] = useState<Recipe | null>(null);
  const [isPending, startTransition] = useTransition();

  const setRecipes = useCallback((r: Recipe[]) => {
    setRecipesState(r);
    saveToStorage(STORAGE_KEY_RECIPES, r);
  }, []);

  function toggleFavorite(title: string) {
    setFavoritesState((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      saveToStorage(STORAGE_KEY_FAVORITES, [...next]);
      return next;
    });
  }

  function handleGenerate(forceRefresh = false) {
    setErrorMsg(null);
    setNoExpiring(false);
    setQuotaExceeded(false);
    startTransition(async () => {
      const res = await generateRecipeSuggestions(forceRefresh);
      if (!res.ok) {
        if (res.reason === "no_expiring_items") { setNoExpiring(true); return; }
        if (res.reason === "quota_exceeded") { setQuotaExceeded(true); return; }
        setErrorMsg(res.message ?? "Unbekannter Fehler");
        return;
      }
      setRecipes(res.recipes);
      setFromCache(res.fromCache);
      if (!res.fromCache) setCurrentQuotaUsed((q) => q + 1);
    });
  }

  return (
    <>
      {/* Expiring items header chips */}
      {expiringChips.length > 0 && (
        <section aria-label="Ablaufende Zutaten" className="mb-4">
          <p className="mb-2 text-sm font-medium text-muted-foreground">
            Bald ablaufend
          </p>
          <div className="flex flex-wrap gap-2">
            {expiringChips.map((chip) => (
              <span
                key={chip.id}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium",
                  chip.daysLeft <= 2
                    ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                    : chip.daysLeft <= 4
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                      : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
                )}
              >
                {chip.name}
                {chip.daysLeft === 0
                  ? " · heute"
                  : chip.daysLeft === 1
                    ? " · morgen"
                    : ` · ${chip.daysLeft} Tage`}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Generate button / loading */}
      {recipes.length === 0 && !isPending && !noExpiring && !errorMsg && !quotaExceeded && (
        <Button
          size="lg"
          className="w-full"
          onClick={() => handleGenerate(false)}
          disabled={currentQuotaUsed >= DAILY_QUOTA}
        >
          <ChefHat aria-hidden /> Rezeptvorschläge generieren
        </Button>
      )}

      {isPending && <RecipeSkeletons />}

      {/* No expiring items */}
      {noExpiring && !isPending && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 className="size-10 text-green-500" aria-hidden />
            <p className="font-medium">Alles im grünen Bereich</p>
            <p className="text-sm text-muted-foreground">
              Kein Lebensmittel droht in den nächsten {settings.expiryThresholdDays} Tagen abzulaufen.
            </p>
            <Button variant="outline" size="sm" onClick={() => handleGenerate(false)}>
              Trotzdem Inspiration
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Quota exceeded */}
      {quotaExceeded && !isPending && (
        <Card>
          <CardContent className="py-6 text-center">
            <p className="text-sm text-muted-foreground">
              Tages-Limit von {DAILY_QUOTA} Generierungen erreicht. Morgen wieder verfügbar.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {errorMsg && !isPending && (
        <Card>
          <CardContent className="flex flex-col gap-3 py-4">
            <div className="flex items-center gap-2 text-destructive">
              <XCircle className="size-4" aria-hidden />
              <p className="text-sm">{errorMsg}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => handleGenerate(false)}>
              Erneut versuchen
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Recipe cards */}
      {recipes.length > 0 && !isPending && (
        <div className="flex flex-col gap-4">
          {recipes.map((recipe, i) => (
            <RecipeCard
              key={i}
              recipe={recipe}
              isFavorite={favorites.has(recipe.title)}
              onToggleFavorite={() => toggleFavorite(recipe.title)}
              onCook={() => setCookingRecipe(recipe)}
            />
          ))}

          {/* Refresh + quota footer */}
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-muted-foreground">
              {fromCache ? "Aus Cache" : "Neu generiert"} · {currentQuotaUsed}/{DAILY_QUOTA} heute
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleGenerate(true)}
              disabled={currentQuotaUsed >= DAILY_QUOTA}
            >
              <RefreshCw className="size-3" aria-hidden /> Neue Vorschläge
            </Button>
          </div>
        </div>
      )}

      {/* Cooking modal */}
      {cookingRecipe && (
        <CookingModal
          recipe={cookingRecipe}
          onClose={() => setCookingRecipe(null)}
          onCooked={() => setCookingRecipe(null)}
        />
      )}
    </>
  );
}

// ─── Recipe card ──────────────────────────────────────────────────────────────

function RecipeCard({
  recipe,
  isFavorite,
  onToggleFavorite,
  onCook,
}: {
  recipe: Recipe;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onCook: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [addingItem, setAddingItem] = useState<string | null>(null);

  const missingIngredients = recipe.ingredients.filter((i) => !i.isInPantry);
  const expiringCount = recipe.ingredients.filter((i) => i.isExpiringItem).length;

  const difficultyColor =
    recipe.difficulty === "einfach"
      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
      : recipe.difficulty === "mittel"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
        : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";

  async function addMissingToShopping(ing: RecipeIngredient) {
    setAddingItem(ing.name);
    try {
      const res = await addShoppingItem({
        customName: `${ing.name} (${ing.amount} ${ing.unit})`,
      });
      if (res.ok) toast.success(`„${ing.name}" zur Einkaufsliste hinzugefügt`);
      else toast.error("Fehler", { description: res.error });
    } finally {
      setAddingItem(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug">{recipe.title}</CardTitle>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onToggleFavorite}
              aria-label={isFavorite ? "Aus Favoriten entfernen" : "Als Favorit speichern"}
              className="rounded-full p-1 transition-colors hover:bg-muted"
            >
              <Heart
                className={cn(
                  "size-4 transition-colors",
                  isFavorite
                    ? "fill-red-500 text-red-500"
                    : "text-muted-foreground",
                )}
                aria-hidden
              />
            </button>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", difficultyColor)}>
              {recipe.difficulty}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="size-3" aria-hidden /> {recipe.timeMinutes} min
          </span>
          <span>· {recipe.servings} Portion{recipe.servings !== 1 ? "en" : ""}</span>
          <span>· {expiringCount} ablaufende Zutat{expiringCount !== 1 ? "en" : ""}</span>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{recipe.description}</p>

        {/* Ingredients */}
        <ul className="flex flex-col gap-1">
          {recipe.ingredients.map((ing, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span
                className={cn(
                  "size-4 shrink-0 rounded-full text-center text-xs leading-4",
                  ing.isExpiringItem
                    ? "bg-red-500 text-white"
                    : ing.isInPantry
                      ? "bg-green-500 text-white"
                      : "bg-amber-400 text-white",
                )}
                aria-label={
                  ing.isExpiringItem
                    ? "läuft ab"
                    : ing.isInPantry
                      ? "vorhanden"
                      : "fehlt"
                }
              >
                {ing.isExpiringItem ? "!" : ing.isInPantry ? "✓" : "+"}
              </span>
              <span className={cn(!ing.isInPantry && !ing.isExpiringItem && "text-muted-foreground")}>
                {ing.amount} {ing.unit} {ing.name}
              </span>
            </li>
          ))}
        </ul>

        {/* Limited note */}
        {recipe.feasibility === "limited" && recipe.limitedNote && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
            {recipe.limitedNote}
          </div>
        )}

        {/* Add missing to shopping */}
        {missingIngredients.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {missingIngredients.map((ing) => (
              <button
                key={ing.name}
                onClick={() => void addMissingToShopping(ing)}
                disabled={addingItem === ing.name}
                className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                <Plus className="size-2.5" aria-hidden />
                {ing.name}
              </button>
            ))}
          </div>
        )}

        {/* Steps accordion */}
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-left text-sm font-medium text-primary"
        >
          {expanded ? "Zubereitung ausblenden ▲" : "Zubereitung anzeigen ▼"}
        </button>
        {expanded && (
          <ol className="flex flex-col gap-2">
            {recipe.steps.map((step, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="mt-0.5 size-5 shrink-0 rounded-full bg-muted text-center text-xs font-medium leading-5">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        )}

        {/* Cook button */}
        <Button className="w-full" onClick={onCook}>
          <ChefHat aria-hidden /> Ich koche das jetzt
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function RecipeSkeletons() {
  return (
    <div className="flex flex-col gap-4" aria-busy aria-label="Rezepte werden generiert">
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <CardContent className="flex flex-col gap-3 py-4">
            <div className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
