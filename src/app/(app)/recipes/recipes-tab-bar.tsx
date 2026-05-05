"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type View = "suggestions" | "favorites";

type Props = {
  activeView: View;
  favoritesCount: number;
};

export function RecipesTabBar({ activeView, favoritesCount }: Props) {
  const router = useRouter();

  function navigate(view: View) {
    router.push(view === "favorites" ? "/recipes?view=favorites" : "/recipes");
  }

  return (
    <div className="flex rounded-lg bg-muted p-1" role="tablist">
      <button
        role="tab"
        aria-selected={activeView === "suggestions"}
        onClick={() => navigate("suggestions")}
        className={cn(
          "flex-1 rounded-md py-1.5 text-sm font-medium transition-colors",
          activeView === "suggestions"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Vorschläge
      </button>
      <button
        role="tab"
        aria-selected={activeView === "favorites"}
        onClick={() => navigate("favorites")}
        className={cn(
          "flex-1 rounded-md py-1.5 text-sm font-medium transition-colors",
          activeView === "favorites"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Favoriten
        {favoritesCount > 0 && (
          <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
            {favoritesCount}
          </span>
        )}
      </button>
    </div>
  );
}
