"use server";

import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveHouseholdId } from "@/lib/households/active";
import { generateRecipes } from "@/lib/recipes/generate";
import type {
  ExpiringItem,
  PantryItem,
  Recipe,
  RecipeSuggestionResult,
  UserRecipeSettings,
} from "@/lib/recipes/types";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

const DAILY_QUOTA = 10;

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getUserRecipeSettings(): Promise<
  ActionResult<UserRecipeSettings>
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("Nicht angemeldet");

    const { data } = await supabase
      .from("user_settings")
      .select(
        "expiry_threshold_days, dietary_preferences, disliked_ingredients",
      )
      .eq("user_id", user.id)
      .maybeSingle();

    return {
      ok: true,
      data: {
        expiryThresholdDays: data?.expiry_threshold_days ?? 5,
        dietaryPreferences: data?.dietary_preferences ?? [],
        dislikedIngredients: data?.disliked_ingredients ?? [],
      },
    };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unbekannter Fehler");
  }
}

export async function saveUserRecipeSettings(
  settings: UserRecipeSettings,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("Nicht angemeldet");

    const { error } = await supabase.from("user_settings").upsert(
      {
        user_id: user.id,
        expiry_threshold_days: settings.expiryThresholdDays,
        dietary_preferences: settings.dietaryPreferences,
        disliked_ingredients: settings.dislikedIngredients,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) return fail(error.message);

    revalidatePath("/recipes");
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unbekannter Fehler");
  }
}

// ─── Recipe generation ────────────────────────────────────────────────────────

function computeCacheKey(
  itemIds: string[],
  quantities: number[],
  dietary: string[],
): string {
  const payload = itemIds
    .map((id, i) => `${id}:${quantities[i] ?? 0}`)
    .sort()
    .join(",");
  return createHash("sha256")
    .update(`${payload}|${dietary.sort().join(",")}`)
    .digest("hex");
}

export async function generateRecipeSuggestions(
  forceRefresh = false,
): Promise<RecipeSuggestionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, reason: "error", message: "Nicht angemeldet" };

    const householdId = await getActiveHouseholdId(supabase, user.id);
    if (!householdId)
      return { ok: false, reason: "error", message: "Kein aktiver Haushalt" };

    // Load user settings.
    const settingsRow = await supabase
      .from("user_settings")
      .select("expiry_threshold_days, dietary_preferences, disliked_ingredients")
      .eq("user_id", user.id)
      .maybeSingle();
    const settings: UserRecipeSettings = {
      expiryThresholdDays: settingsRow.data?.expiry_threshold_days ?? 5,
      dietaryPreferences: settingsRow.data?.dietary_preferences ?? [],
      dislikedIngredients: settingsRow.data?.disliked_ingredients ?? [],
    };

    // Load expiring items.
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + settings.expiryThresholdDays);
    const thresholdStr = threshold.toISOString().slice(0, 10);

    const { data: expiringRows } = await supabase
      .from("items")
      .select(
        "id, quantity, unit, best_before, custom_name, product:products(name, brand)",
      )
      .eq("household_id", householdId)
      .is("consumed_at", null)
      .is("discarded_at", null)
      .lte("best_before", thresholdStr)
      .gt("quantity", 0)
      .order("best_before", { ascending: true });

    if (!expiringRows || expiringRows.length === 0) {
      return { ok: false, reason: "no_expiring_items" };
    }

    const today = new Date();
    const expiringItems: ExpiringItem[] = expiringRows.map((row) => {
      const expDate = new Date(row.best_before);
      const daysLeft = Math.max(
        0,
        Math.ceil((expDate.getTime() - today.getTime()) / 86_400_000),
      );
      const product = Array.isArray(row.product) ? row.product[0] : row.product;
      return {
        id: row.id,
        name: row.custom_name ?? product?.name ?? "Unbekannt",
        brand: product?.brand ?? undefined,
        quantity: Number(row.quantity),
        unit: row.unit ?? "Stk",
        daysLeft,
      };
    });

    // Compute cache key.
    const cacheKey = computeCacheKey(
      expiringItems.map((i) => i.id),
      expiringItems.map((i) => i.quantity),
      settings.dietaryPreferences,
    );

    // Cache hit?
    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from("recipe_suggestions")
        .select("recipes")
        .eq("household_id", householdId)
        .eq("cache_key", cacheKey)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (cached) {
        return {
          ok: true,
          recipes: cached.recipes as Recipe[],
          fromCache: true,
        };
      }
    }

    // Daily quota check.
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from("recipe_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("household_id", householdId)
      .gte("created_at", todayStart.toISOString());

    if ((count ?? 0) >= DAILY_QUOTA) {
      return { ok: false, reason: "quota_exceeded" };
    }

    // Load pantry items for context (non-expiring).
    const { data: pantryRows } = await supabase
      .from("items")
      .select("custom_name, custom_category, product:products(name, category), quantity, unit")
      .eq("household_id", householdId)
      .is("consumed_at", null)
      .is("discarded_at", null)
      .gt("best_before", thresholdStr)
      .gt("quantity", 0)
      .limit(40);

    const pantryItems: PantryItem[] = (pantryRows ?? []).map((row) => {
      const product = Array.isArray(row.product) ? row.product[0] : row.product;
      return {
        name: row.custom_name ?? product?.name ?? "Unbekannt",
        category: row.custom_category ?? product?.category ?? "other",
        quantity: Number(row.quantity),
        unit: row.unit ?? "Stk",
      };
    });

    // Generate via LLM.
    const recipes = await generateRecipes(expiringItems, pantryItems, settings);

    // Upsert into cache (TTL 24h).
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await supabase.from("recipe_suggestions").upsert(
      {
        household_id: householdId,
        cache_key: cacheKey,
        input_item_ids: expiringItems.map((i) => i.id),
        recipes: JSON.parse(JSON.stringify(recipes)) as import("@/lib/supabase/database.types").Json,
        expires_at: expiresAt.toISOString(),
      },
      { onConflict: "household_id,cache_key" },
    );

    return { ok: true, recipes, fromCache: false };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : "Unbekannter Fehler",
    };
  }
}

export async function getDailyQuotaUsed(): Promise<number> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return 0;

    const householdId = await getActiveHouseholdId(supabase, user.id);
    if (!householdId) return 0;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from("recipe_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("household_id", householdId)
      .gte("created_at", todayStart.toISOString());

    return count ?? 0;
  } catch {
    return 0;
  }
}

// ─── Mark cooked ─────────────────────────────────────────────────────────────

export type CookedIngredient = {
  itemId: string;
  usedQuantity: number;
};

export async function markRecipeCooked(
  recipe: Recipe,
  consumed: CookedIngredient[],
): Promise<ActionResult<{ cookedMealId: string }>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("Nicht angemeldet");

    const householdId = await getActiveHouseholdId(supabase, user.id);
    if (!householdId) return fail("Kein aktiver Haushalt");

    const consumedItemIds: string[] = [];

    // Update item quantities; mark as consumed if depleted.
    for (const { itemId, usedQuantity } of consumed) {
      if (usedQuantity <= 0) continue;

      const { data: item } = await supabase
        .from("items")
        .select("quantity")
        .eq("id", itemId)
        .eq("household_id", householdId)
        .maybeSingle();

      if (!item) continue;

      const remaining = Math.max(0, Number(item.quantity) - usedQuantity);
      const patch =
        remaining === 0
          ? { quantity: 0, consumed_at: new Date().toISOString() }
          : { quantity: remaining };

      await supabase
        .from("items")
        .update(patch)
        .eq("id", itemId)
        .eq("household_id", householdId);

      consumedItemIds.push(itemId);
    }

    // Record the cooked meal.
    const { data: meal, error: mealErr } = await supabase
      .from("cooked_meals")
      .insert({
        household_id: householdId,
        user_id: user.id,
        recipe_title: recipe.title,
        recipe_data: JSON.parse(JSON.stringify(recipe)) as import("@/lib/supabase/database.types").Json,
        consumed_item_ids: consumedItemIds,
      })
      .select("id")
      .single();

    if (mealErr || !meal) {
      return fail(mealErr?.message ?? "Mahlzeit nicht gespeichert");
    }

    revalidatePath("/");
    revalidatePath("/recipes");
    revalidatePath("/stats");

    return { ok: true, data: { cookedMealId: meal.id } };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unbekannter Fehler");
  }
}

// ─── Expiring items count (for dashboard widget) ──────────────────────────────

export async function getExpiringItemsCount(
  thresholdDays = 5,
): Promise<number> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return 0;

    const householdId = await getActiveHouseholdId(supabase, user.id);
    if (!householdId) return 0;

    const threshold = new Date();
    threshold.setDate(threshold.getDate() + thresholdDays);
    const thresholdStr = threshold.toISOString().slice(0, 10);

    const { count } = await supabase
      .from("items")
      .select("id", { count: "exact", head: true })
      .eq("household_id", householdId)
      .is("consumed_at", null)
      .is("discarded_at", null)
      .lte("best_before", thresholdStr)
      .gt("quantity", 0);

    return count ?? 0;
  } catch {
    return 0;
  }
}
