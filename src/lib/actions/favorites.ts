"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveHouseholdId } from "@/lib/households/active";
import type { Recipe, RecipeFavorite } from "@/lib/recipes/types";
import type { Json } from "@/lib/supabase/database.types";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; reason: string };

function fail(reason: string): ActionResult<never> {
  return { ok: false, reason };
}

// ─── Favorites ───────────────────────────────────────────────────────────────

export async function addToFavorites(
  recipe: Recipe,
  sourceSuggestionId?: string,
): Promise<ActionResult<{ favoriteId: string }>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail("Nicht angemeldet");

    const householdId = await getActiveHouseholdId(supabase, user.id);
    if (!householdId) return fail("Kein aktiver Haushalt");

    // Prevent duplicates
    const { data: existing } = await supabase
      .from("recipe_favorites")
      .select("id")
      .eq("household_id", householdId)
      .eq("recipe_title", recipe.title)
      .maybeSingle();
    if (existing) return { ok: true, data: { favoriteId: existing.id } };

    const { data, error } = await supabase
      .from("recipe_favorites")
      .insert({
        household_id: householdId,
        user_id: user.id,
        recipe_title: recipe.title,
        recipe_data: JSON.parse(JSON.stringify(recipe)) as Json,
        source_suggestion_id: sourceSuggestionId ?? null,
      })
      .select("id")
      .single();

    if (error || !data) return fail(error?.message ?? "Konnte nicht speichern");

    revalidatePath("/recipes");
    return { ok: true, data: { favoriteId: data.id } };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unbekannter Fehler");
  }
}

export async function removeFromFavorites(
  favoriteId: string,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail("Nicht angemeldet");

    const householdId = await getActiveHouseholdId(supabase, user.id);
    if (!householdId) return fail("Kein aktiver Haushalt");

    const { error } = await supabase
      .from("recipe_favorites")
      .delete()
      .eq("id", favoriteId)
      .eq("household_id", householdId);

    if (error) return fail(error.message);

    revalidatePath("/recipes");
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unbekannter Fehler");
  }
}

export async function getFavorites(filter?: {
  search?: string;
  tags?: string[];
  difficulty?: Recipe["difficulty"][];
  maxMinutes?: number;
  sortBy?: "recent" | "most_cooked" | "alpha";
}): Promise<RecipeFavorite[]> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const householdId = await getActiveHouseholdId(supabase, user.id);
    if (!householdId) return [];

    let query = supabase
      .from("recipe_favorites")
      .select("*")
      .eq("household_id", householdId);

    const sortBy = filter?.sortBy ?? "recent";
    if (sortBy === "most_cooked") {
      query = query.order("cooked_count", { ascending: false }).order("created_at", { ascending: false });
    } else if (sortBy === "alpha") {
      query = query.order("recipe_title", { ascending: true });
    } else {
      query = query.order("created_at", { ascending: false });
    }

    const { data } = await query;

    return (data ?? [])
      .map((row) => ({
        id: row.id,
        recipeTitle: row.recipe_title,
        recipeData: row.recipe_data as unknown as Recipe,
        sourceSuggestionId: row.source_suggestion_id ?? undefined,
        tags: row.tags ?? [],
        notes: row.notes ?? undefined,
        cookedCount: row.cooked_count,
        lastCookedAt: row.last_cooked_at ?? undefined,
        createdAt: row.created_at,
      }))
      .filter((fav) => {
        if (filter?.search) {
          const q = filter.search.toLowerCase();
          if (!fav.recipeTitle.toLowerCase().includes(q)) return false;
        }
        if (filter?.tags?.length) {
          if (!filter.tags.every((t) => fav.tags.includes(t))) return false;
        }
        if (filter?.difficulty?.length) {
          if (!filter.difficulty.includes(fav.recipeData.difficulty)) return false;
        }
        if (filter?.maxMinutes) {
          if (fav.recipeData.timeMinutes > filter.maxMinutes) return false;
        }
        return true;
      });
  } catch {
    return [];
  }
}

export async function updateFavoriteTags(
  favoriteId: string,
  tags: string[],
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail("Nicht angemeldet");

    const householdId = await getActiveHouseholdId(supabase, user.id);
    if (!householdId) return fail("Kein aktiver Haushalt");

    // Ensure all tags exist in recipe_tags
    for (const name of tags) {
      await supabase
        .from("recipe_tags")
        .upsert({ household_id: householdId, name }, { onConflict: "household_id,name", ignoreDuplicates: true });
    }

    const { error } = await supabase
      .from("recipe_favorites")
      .update({ tags })
      .eq("id", favoriteId)
      .eq("household_id", householdId);

    if (error) return fail(error.message);
    revalidatePath("/recipes");
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unbekannter Fehler");
  }
}

export async function updateFavoriteNote(
  favoriteId: string,
  notes: string,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail("Nicht angemeldet");

    const householdId = await getActiveHouseholdId(supabase, user.id);
    if (!householdId) return fail("Kein aktiver Haushalt");

    const { error } = await supabase
      .from("recipe_favorites")
      .update({ notes: notes || null })
      .eq("id", favoriteId)
      .eq("household_id", householdId);

    if (error) return fail(error.message);
    revalidatePath("/recipes");
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unbekannter Fehler");
  }
}

export async function markFavoriteAsCooked(
  favoriteId: string,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail("Nicht angemeldet");

    const householdId = await getActiveHouseholdId(supabase, user.id);
    if (!householdId) return fail("Kein aktiver Haushalt");

    const { data: fav } = await supabase
      .from("recipe_favorites")
      .select("cooked_count")
      .eq("id", favoriteId)
      .eq("household_id", householdId)
      .maybeSingle();

    if (!fav) return fail("Favorit nicht gefunden");

    const { error } = await supabase
      .from("recipe_favorites")
      .update({
        cooked_count: fav.cooked_count + 1,
        last_cooked_at: new Date().toISOString(),
      })
      .eq("id", favoriteId)
      .eq("household_id", householdId);

    if (error) return fail(error.message);
    revalidatePath("/recipes");
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unbekannter Fehler");
  }
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

export async function getHouseholdTags(): Promise<string[]> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const householdId = await getActiveHouseholdId(supabase, user.id);
    if (!householdId) return [];

    const { data } = await supabase
      .from("recipe_tags")
      .select("name")
      .eq("household_id", householdId)
      .order("name", { ascending: true });

    return (data ?? []).map((r) => r.name);
  } catch {
    return [];
  }
}
