import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/session";
import { getActiveHouseholdId } from "@/lib/households/active";
import { getFavorites, getHouseholdTags } from "@/lib/actions/favorites";
import { RecipeSuggestions } from "./recipe-suggestions";
import { FavoritesView } from "./favorites-view";
import { RecipesTabBar } from "./recipes-tab-bar";

export const metadata = { title: "Kochen" };

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const view = params.view === "favorites" ? "favorites" : "suggestions";

  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  if (!user) return null;

  const householdId = await getActiveHouseholdId(supabase, user.id);

  // Load user recipe settings
  const { data: settingsRow } = householdId
    ? await supabase
        .from("user_settings")
        .select("expiry_threshold_days, dietary_preferences, disliked_ingredients")
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null };

  const thresholdDays = settingsRow?.expiry_threshold_days ?? 5;

  // Load expiring items chips
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + thresholdDays);
  const thresholdStr = threshold.toISOString().slice(0, 10);

  const { data: expiringRows } = householdId
    ? await supabase
        .from("items")
        .select("id, best_before, custom_name, quantity, unit, product:products(name)")
        .eq("household_id", householdId)
        .eq("item_category", "food")
        .is("consumed_at", null)
        .is("discarded_at", null)
        .lte("best_before", thresholdStr)
        .gt("quantity", 0)
        .order("best_before", { ascending: true })
    : { data: null };

  const today = new Date();
  const expiringChips = (expiringRows ?? []).map((row) => {
    const expDate = new Date(row.best_before);
    const daysLeft = Math.max(0, Math.ceil((expDate.getTime() - today.getTime()) / 86_400_000));
    const product = Array.isArray(row.product) ? row.product[0] : row.product;
    return { id: row.id, name: row.custom_name ?? product?.name ?? "Unbekannt", daysLeft };
  });

  // Daily quota
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { count: quotaUsed } = householdId
    ? await supabase
        .from("recipe_suggestions")
        .select("id", { count: "exact", head: true })
        .eq("household_id", householdId)
        .gte("created_at", todayStart.toISOString())
    : { count: 0 };

  // Load favorites (needed for both views: suggestions uses it for heart state)
  const [favorites, householdTags] = await Promise.all([
    getFavorites(),
    getHouseholdTags(),
  ]);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 pb-24">
      <h1 className="mb-4 font-serif text-[26px] font-medium tracking-tight">Kochen</h1>

      <RecipesTabBar activeView={view} favoritesCount={favorites.length} />

      <div className="mt-4">
        {view === "suggestions" ? (
          <RecipeSuggestions
            expiringChips={expiringChips}
            quotaUsed={quotaUsed ?? 0}
            settings={{
              expiryThresholdDays: thresholdDays,
              dietaryPreferences: settingsRow?.dietary_preferences ?? [],
              dislikedIngredients: settingsRow?.disliked_ingredients ?? [],
            }}
            initialFavorites={favorites}
          />
        ) : (
          <FavoritesView
            initialFavorites={favorites}
            householdTags={householdTags}
          />
        )}
      </div>
    </div>
  );
}
