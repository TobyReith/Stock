"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { markRecipeCooked } from "@/lib/actions/recipes";
import { markFavoriteAsCooked } from "@/lib/actions/favorites";
import type { Recipe, RecipeIngredient } from "@/lib/recipes/types";

type Props = {
  recipe: Recipe;
  favoriteId?: string;
  onClose: () => void;
  onCooked: () => void;
};

export function CookingModal({ recipe, favoriteId, onClose, onCooked }: Props) {
  // Only show ingredients that are expiring and in pantry (i.e., have matchedItemId).
  const cookableIngredients = recipe.ingredients.filter(
    (i) => i.isExpiringItem && i.isInPantry && i.matchedItemId,
  );

  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const ing of cookableIngredients) {
      if (ing.matchedItemId) init[ing.matchedItemId] = ing.amount;
    }
    return init;
  });

  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const consumed = Object.entries(quantities)
        .filter(([, qty]) => qty > 0)
        .map(([itemId, usedQuantity]) => ({ itemId, usedQuantity }));

      const res = await markRecipeCooked(recipe, consumed);
      if (!res.ok) {
        toast.error("Fehler beim Speichern", { description: res.error });
        return;
      }
      if (favoriteId) await markFavoriteAsCooked(favoriteId);
      toast.success(`„${recipe.title}" gekocht – ${consumed.length} Artikel aktualisiert`);
      onCooked();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6">
        <h2 className="mb-1 font-serif text-[26px] font-medium leading-tight text-foreground">{recipe.title}</h2>
        <p className="mb-4 text-sm text-muted">
          Wie viel hast du davon verwendet?
        </p>

        {cookableIngredients.length === 0 ? (
          <p className="mb-4 text-sm text-muted">
            Keine ablaufenden Artikel zum Abbuchen gefunden.
          </p>
        ) : (
          <ul className="mb-4 flex flex-col gap-3">
            {cookableIngredients.map((ing) => (
              <IngredientRow
                key={ing.matchedItemId}
                ingredient={ing}
                value={quantities[ing.matchedItemId!] ?? ing.amount}
                onChange={(v) =>
                  setQuantities((prev) => ({ ...prev, [ing.matchedItemId!]: v }))
                }
              />
            ))}
          </ul>
        )}

        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={handleConfirm}
            disabled={isPending}
          >
            {isPending ? (
              <><Loader2 className="animate-spin" aria-hidden /> Speichern…</>
            ) : (
              "Gekocht – Vorrat aktualisieren"
            )}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Abbrechen
          </Button>
        </div>
      </div>
    </div>
  );
}

function IngredientRow({
  ingredient,
  value,
  onChange,
}: {
  ingredient: RecipeIngredient;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium">{ingredient.name}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          step={0.1}
          value={value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
          className="w-20 rounded-lg border border-border bg-surface px-2 py-1 text-right font-mono text-sm text-foreground outline-none focus:border-border-strong"
        />
        <span className="w-8 font-mono text-xs text-muted">{ingredient.unit}</span>
      </div>
    </li>
  );
}
