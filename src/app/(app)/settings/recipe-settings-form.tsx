"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { saveUserRecipeSettings } from "@/lib/actions/recipes";
import type { UserRecipeSettings } from "@/lib/recipes/types";

const THRESHOLD_OPTIONS = [2, 3, 5, 7] as const;
const DIETARY_OPTIONS = [
  "vegetarisch",
  "vegan",
  "glutenfrei",
  "laktosefrei",
] as const;

type Props = { initial: UserRecipeSettings };

export function RecipeSettingsForm({ initial }: Props) {
  const [thresholdDays, setThresholdDays] = useState(
    initial.expiryThresholdDays,
  );
  const [dietary, setDietary] = useState<string[]>(initial.dietaryPreferences);
  const [dislikedInput, setDislikedInput] = useState(
    initial.dislikedIngredients.join(", "),
  );
  const [isPending, startTransition] = useTransition();

  function toggleDietary(pref: string) {
    setDietary((prev) =>
      prev.includes(pref) ? prev.filter((p) => p !== pref) : [...prev, pref],
    );
  }

  function handleSave() {
    const disliked = dislikedInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    startTransition(async () => {
      const res = await saveUserRecipeSettings({
        expiryThresholdDays: thresholdDays,
        dietaryPreferences: dietary,
        dislikedIngredients: disliked,
      });
      if (!res.ok) toast.error("Nicht gespeichert", { description: res.error });
      else toast.success("Einstellungen gespeichert");
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      {/* Threshold */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Ablaufschwelle</p>
        <div className="flex gap-2">
          {THRESHOLD_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setThresholdDays(d)}
              className={cn(
                "flex-1 rounded-lg border py-2 text-sm font-medium transition-colors",
                thresholdDays === d
                  ? "border-primary bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {d}d
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Artikel die in ≤ {thresholdDays} Tagen ablaufen werden als Rezutat vorgeschlagen.
        </p>
      </div>

      {/* Dietary prefs */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Diätpräferenzen</p>
        <div className="flex flex-wrap gap-2">
          {DIETARY_OPTIONS.map((pref) => (
            <button
              key={pref}
              type="button"
              onClick={() => toggleDietary(pref)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                dietary.includes(pref)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {pref}
            </button>
          ))}
        </div>
      </div>

      {/* Disliked ingredients */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="disliked" className="text-sm font-medium">
          Zutaten vermeiden{" "}
          <span className="text-muted-foreground">(kommagetrennt)</span>
        </label>
        <input
          id="disliked"
          type="text"
          value={dislikedInput}
          onChange={(e) => setDislikedInput(e.target.value)}
          placeholder="z.B. Rosinen, Koriander"
          className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
        />
      </div>

      <Button onClick={handleSave} disabled={isPending}>
        {isPending ? "Speichern…" : "Speichern"}
      </Button>
    </div>
  );
}
