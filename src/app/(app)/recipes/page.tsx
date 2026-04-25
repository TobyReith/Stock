import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/session";
import { getActiveHouseholdId } from "@/lib/households/active";
import { RecipeSuggestions } from "./recipe-suggestions";

export const metadata = { title: "Kochen" };

export default async function RecipesPage() {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  if (!user) return null;

  const householdId = await getActiveHouseholdId(supabase, user.id);

  // Load user recipe settings.
  const { data: settingsRow } = householdId
    ? await supabase
        .from("user_settings")
        .select("expiry_threshold_days, dietary_preferences, disliked_ingredients")
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null };

  const thresholdDays = settingsRow?.expiry_threshold_days ?? 5;

  // Load expiring items for the header chips.
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + thresholdDays);
  const thresholdStr = threshold.toISOString().slice(0, 10);

  const { data: expiringRows } = householdId
    ? await supabase
        .from("items")
        .select("id, best_before, custom_name, quantity, unit, product:products(name)")
        .eq("household_id", householdId)
        .is("consumed_at", null)
        .is("discarded_at", null)
        .lte("best_before", thresholdStr)
        .gt("quantity", 0)
        .order("best_before", { ascending: true })
    : { data: null };

  const today = new Date();
  const expiringChips = (expiringRows ?? []).map((row) => {
    const expDate = new Date(row.best_before);
    const daysLeft = Math.max(
      0,
      Math.ceil((expDate.getTime() - today.getTime()) / 86_400_000),
    );
    const product = Array.isArray(row.product) ? row.product[0] : row.product;
    return {
      id: row.id,
      name: row.custom_name ?? product?.name ?? "Unbekannt",
      daysLeft,
    };
  });

  // Daily quota used today.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { count: quotaUsed } = householdId
    ? await supabase
        .from("recipe_suggestions")
        .select("id", { count: "exact", head: true })
        .eq("household_id", householdId)
        .gte("created_at", todayStart.toISOString())
    : { count: 0 };

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 pb-24">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Kochen</h1>
      <RecipeSuggestions
        expiringChips={expiringChips}
        quotaUsed={quotaUsed ?? 0}
        settings={{
          expiryThresholdDays: thresholdDays,
          dietaryPreferences: settingsRow?.dietary_preferences ?? [],
          dislikedIngredients: settingsRow?.disliked_ingredients ?? [],
        }}
      />
    </div>
  );
}
