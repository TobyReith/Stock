"use client";

import { useState, useTransition, useCallback } from "react";
import { ChefHat, CheckCircle2, Clock, Heart, Loader2, Plus, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { generateRecipeSuggestions } from "@/lib/actions/recipes";
import { addToFavorites, removeFromFavorites } from "@/lib/actions/favorites";
import { addShoppingItem } from "@/lib/actions/shopping";
import type { Recipe, RecipeIngredient, RecipeFavorite, UserRecipeSettings } from "@/lib/recipes/types";
import { CookingModal } from "./cooking-modal";
import { DAILY_RECIPE_QUOTA } from "@/lib/constants/app";
const STORAGE_KEY_RECIPES = "stock:recipes";

function loadRecipesFromStorage(): Recipe[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RECIPES);
    return raw ? (JSON.parse(raw) as Recipe[]) : [];
  } catch {
    return [];
  }
}

function saveRecipesToStorage(recipes: Recipe[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_RECIPES, JSON.stringify(recipes));
  } catch {}
}

type ExpiringChip = { id: string; name: string; daysLeft: number };

type Props = {
  expiringChips: ExpiringChip[];
  quotaUsed: number;
  settings: UserRecipeSettings;
  initialFavorites: RecipeFavorite[];
};

export function RecipeSuggestions({ expiringChips, quotaUsed, settings, initialFavorites }: Props) {
  const [recipes, setRecipesState] = useState<Recipe[]>(() => loadRecipesFromStorage());

  // title → favoriteId (optimistic)
  const [favoriteMap, setFavoriteMap] = useState<Map<string, string>>(() =>
    new Map(initialFavorites.map((f) => [f.recipeTitle, f.id])),
  );

  const [fromCache, setFromCache] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noExpiring, setNoExpiring] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [currentQuotaUsed, setCurrentQuotaUsed] = useState(quotaUsed);
  const [cookingRecipe, setCookingRecipe] = useState<Recipe | null>(null);
  const [isPending, startTransition] = useTransition();

  const setRecipes = useCallback((r: Recipe[]) => {
    setRecipesState(r);
    saveRecipesToStorage(r);
  }, []);

  async function toggleFavorite(recipe: Recipe) {
    const existingId = favoriteMap.get(recipe.title);
    if (existingId) {
      // Optimistic remove
      setFavoriteMap((prev) => { const next = new Map(prev); next.delete(recipe.title); return next; });
      const res = await removeFromFavorites(existingId);
      if (!res.ok) {
        setFavoriteMap((prev) => new Map(prev).set(recipe.title, existingId));
        toast.error("Fehler", { description: res.reason });
      } else {
        toast.success("Aus Favoriten entfernt");
      }
    } else {
      // Optimistic add with temp id
      const tempId = `temp-${Date.now()}`;
      setFavoriteMap((prev) => new Map(prev).set(recipe.title, tempId));
      const res = await addToFavorites(recipe);
      if (!res.ok) {
        setFavoriteMap((prev) => { const next = new Map(prev); next.delete(recipe.title); return next; });
        toast.error("Fehler", { description: res.reason });
      } else {
        setFavoriteMap((prev) => new Map(prev).set(recipe.title, res.data.favoriteId));
        toast.success("Zu Favoriten hinzugefügt");
      }
    }
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
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted">Bald ablaufend</p>
          <div className="flex flex-wrap gap-2">
            {expiringChips.map((chip) => (
              <span
                key={chip.id}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium",
                  chip.daysLeft <= 2
                    ? "bg-danger-subtle text-danger"
                    : chip.daysLeft <= 4
                      ? "bg-warning-subtle text-warning"
                      : "bg-primary-subtle text-primary-text",
                )}
              >
                {chip.name}
                {chip.daysLeft === 0 ? " · heute" : chip.daysLeft === 1 ? " · morgen" : ` · ${chip.daysLeft} Tage`}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Generate button */}
      {recipes.length === 0 && !isPending && !noExpiring && !errorMsg && !quotaExceeded && (
        <Button size="lg" className="w-full" onClick={() => handleGenerate(false)} disabled={currentQuotaUsed >= DAILY_RECIPE_QUOTA}>
          <ChefHat aria-hidden /> Rezeptvorschläge generieren
        </Button>
      )}

      {isPending && <RecipeSkeletons />}

      {noExpiring && !isPending && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 className="size-10 text-primary-text" aria-hidden />
            <p className="font-medium">Alles im grünen Bereich</p>
            <p className="text-sm text-muted">
              Kein Lebensmittel droht in den nächsten {settings.expiryThresholdDays} Tagen abzulaufen.
            </p>
            <Button variant="outline" size="sm" onClick={() => handleGenerate(false)}>
              Trotzdem Inspiration
            </Button>
          </CardContent>
        </Card>
      )}

      {quotaExceeded && !isPending && (
        <Card>
          <CardContent className="py-6 text-center">
            <p className="text-sm text-muted">
              Tages-Limit von {DAILY_RECIPE_QUOTA} Generierungen erreicht. Morgen wieder verfügbar.
            </p>
          </CardContent>
        </Card>
      )}

      {errorMsg && !isPending && (
        <Card>
          <CardContent className="flex flex-col gap-3 py-4">
            <div className="flex items-center gap-2 text-danger">
              <XCircle className="size-4" aria-hidden />
              <p className="text-sm">{errorMsg}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => handleGenerate(false)}>Erneut versuchen</Button>
          </CardContent>
        </Card>
      )}

      {recipes.length > 0 && !isPending && (
        <div className="flex flex-col gap-4">
          {recipes.map((recipe, i) => (
            <RecipeCard
              key={i}
              recipe={recipe}
              isFavorite={favoriteMap.has(recipe.title)}
              onToggleFavorite={() => void toggleFavorite(recipe)}
              onCook={() => setCookingRecipe(recipe)}
            />
          ))}

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-muted">
              {fromCache ? "Aus Cache" : "Neu generiert"} · {currentQuotaUsed}/{DAILY_RECIPE_QUOTA} heute
            </p>
            <Button variant="ghost" size="sm" onClick={() => handleGenerate(true)} disabled={currentQuotaUsed >= DAILY_RECIPE_QUOTA}>
              <RefreshCw className="size-3" aria-hidden /> Neue Vorschläge
            </Button>
          </div>
        </div>
      )}

      {cookingRecipe && (
        <CookingModal
          recipe={cookingRecipe}
          favoriteId={favoriteMap.get(cookingRecipe.title)}
          onClose={() => setCookingRecipe(null)}
          onCooked={() => setCookingRecipe(null)}
        />
      )}
    </>
  );
}

// ─── Shared recipe card (used by both Suggestions and Favorites views) ────────

export function RecipeCard({
  recipe,
  isFavorite,
  onToggleFavorite,
  onCook,
  tags,
  notes,
  cookedCount,
  lastCookedAt,
}: {
  recipe: Recipe;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onCook: () => void;
  tags?: string[];
  notes?: string;
  cookedCount?: number;
  lastCookedAt?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [addingItem, setAddingItem] = useState<string | null>(null);

  const missingIngredients = recipe.ingredients.filter((i) => !i.isInPantry);
  const expiringCount = recipe.ingredients.filter((i) => i.isExpiringItem).length;

  const difficultyColor =
    recipe.difficulty === "einfach"
      ? "bg-primary-subtle text-primary-text"
      : recipe.difficulty === "mittel"
        ? "bg-warning-subtle text-warning"
        : "bg-danger-subtle text-danger";

  async function addMissingToShopping(ing: RecipeIngredient) {
    setAddingItem(ing.name);
    try {
      const res = await addShoppingItem({ customName: `${ing.name} (${ing.amount} ${ing.unit})` });
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
              className="rounded-full p-1 transition-colors hover:bg-surface-raised"
            >
              <Heart
                className={cn("size-4 transition-colors", isFavorite ? "fill-danger text-danger" : "text-muted")}
                aria-hidden
              />
            </button>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", difficultyColor)}>
              {recipe.difficulty}
            </span>
          </div>
        </div>

        {/* Tags row */}
        {tags && tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {tags.map((tag) => (
              <span key={tag} className="rounded-full bg-surface-raised px-2 py-0.5 text-xs text-muted">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-1">
            <Clock className="size-3" aria-hidden /> {recipe.timeMinutes} min
          </span>
          <span>· {recipe.servings} Portion{recipe.servings !== 1 ? "en" : ""}</span>
          {expiringCount > 0 && (
            <span>· {expiringCount} ablaufend{expiringCount !== 1 ? "e" : "e"}</span>
          )}
          {cookedCount !== undefined && cookedCount > 0 && (
            <span>· {cookedCount}× gekocht</span>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted">{recipe.description}</p>

        {/* Personal note */}
        {notes && (
          <p className="text-sm italic text-muted">✏️ {notes}</p>
        )}

        {/* Ingredients */}
        <ul className="flex flex-col gap-1">
          {recipe.ingredients.map((ing, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span
                className={cn(
                  "size-4 shrink-0 rounded-full text-center text-xs leading-4",
                  ing.isExpiringItem
                    ? "bg-danger text-foreground"
                    : ing.isInPantry
                      ? "bg-primary text-primary-fg"
                      : "bg-warning text-foreground",
                )}
                aria-label={ing.isExpiringItem ? "läuft ab" : ing.isInPantry ? "vorhanden" : "fehlt"}
              >
                {ing.isExpiringItem ? "!" : ing.isInPantry ? "✓" : "+"}
              </span>
              <span className={cn(!ing.isInPantry && !ing.isExpiringItem && "text-muted")}>
                {ing.amount} {ing.unit} {ing.name}
              </span>
            </li>
          ))}
        </ul>

        {recipe.feasibility === "limited" && recipe.limitedNote && (
          <div className="rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-xs text-warning">
            {recipe.limitedNote}
          </div>
        )}

        {missingIngredients.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {missingIngredients.map((ing) => (
              <button
                key={ing.name}
                onClick={() => void addMissingToShopping(ing)}
                disabled={addingItem === ing.name}
                className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted transition-colors hover:bg-surface-raised disabled:opacity-50"
              >
                <Plus className="size-2.5" aria-hidden />
                {ing.name}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-left text-sm font-medium text-primary-text"
        >
          {expanded ? "Zubereitung ausblenden ▲" : "Zubereitung anzeigen ▼"}
        </button>
        {expanded && (
          <ol className="flex flex-col gap-2">
            {recipe.steps.map((step, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="mt-0.5 size-5 shrink-0 rounded-full bg-surface-raised text-center text-xs font-medium leading-5">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        )}

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
              <Loader2 className="size-4 animate-spin text-muted" aria-hidden />
              <div className="h-4 w-3/4 animate-pulse rounded bg-surface-raised" />
            </div>
            <div className="h-3 w-full animate-pulse rounded bg-surface-raised" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-surface-raised" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-surface-raised" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
