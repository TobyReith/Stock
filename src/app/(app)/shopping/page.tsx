import type { Metadata } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/session";
import { getActiveHouseholdId } from "@/lib/households/active";
import type { Database } from "@/lib/supabase/database.types";
import type { CategoryDisplay } from "@/lib/schemas/categories";
import { ShoppingList, type ShoppingEntry } from "./shopping-list";

export const metadata: Metadata = { title: "Einkauf" };

export default async function ShoppingPage() {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  if (!user) return <UnauthedState />;

  const activeHouseholdId = await getActiveHouseholdId(supabase, user.id);

  const { open, recent, categories, error } = activeHouseholdId
    ? await loadShoppingEntries(supabase, activeHouseholdId)
    : { open: [] as ShoppingEntry[], recent: [] as ShoppingEntry[], categories: [] as CategoryDisplay[], error: null };

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <header className="mb-4">
        <h1 className="font-serif text-[26px] font-medium tracking-tight">Einkauf</h1>
        <p className="mt-1 text-sm text-muted">
          Was noch fehlt. Abgehakte Artikel bleiben 7 Tage sichtbar.
        </p>
      </header>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          Konnte Liste nicht laden: {error}
        </div>
      ) : (
        <ShoppingList open={open} recent={recent} categories={categories} />
      )}
    </div>
  );
}

function UnauthedState() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <p className="text-sm text-muted">
        Bitte melde dich an, um deine Einkaufsliste zu sehen.
      </p>
    </div>
  );
}

async function loadShoppingEntries(
  supabase: SupabaseClient<Database>,
  householdId: string,
): Promise<{
  open: ShoppingEntry[];
  recent: ShoppingEntry[];
  categories: CategoryDisplay[];
  error: string | null;
}> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);

  const [itemsResult, categoriesResult] = await Promise.all([
    supabase
      .from("shopping_list_items")
      .select(
        `
        id, custom_name, brand, image_url, category, item_category, quantity, unit, note, added_at, bought_at, product_id,
        product:products ( id, name, brand, image_url, category )
        `,
      )
      .eq("household_id", householdId)
      .or(`bought_at.is.null,bought_at.gte.${cutoff.toISOString()}`)
      .order("added_at", { ascending: false }),
    supabase
      .from("categories")
      .select("id, name, icon, slug, sort_order, is_system, color, parent_category")
      .eq("household_id", householdId)
      .order("sort_order", { ascending: true }),
  ]);

  if (itemsResult.error)
    return { open: [], recent: [], categories: [], error: itemsResult.error.message };

  const categories: CategoryDisplay[] = (categoriesResult.data ?? []).map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    icon: c.icon,
    color: c.color,
    sortOrder: c.sort_order,
    isSystem: c.is_system,
    parentCategory: c.parent_category,
  }));

  // For entries without item_category (pre-migration or free-text), infer the
  // type from the Vorrat. Product-linked entries match by product_id; free-text
  // entries fall back to a case-insensitive name match against active items.
  const nullTyped = (itemsResult.data ?? []).filter((r) => !r.item_category);
  const inferredItemCategory = new Map<string, string>(); // keyed by shopping row id

  if (nullTyped.length > 0) {
    const productIds = nullTyped.filter((r) => r.product_id).map((r) => r.product_id!);
    const names = nullTyped.filter((r) => !r.product_id && r.custom_name).map((r) => r.custom_name!.toLowerCase());

    const [byProductId, byName] = await Promise.all([
      productIds.length > 0
        ? supabase
            .from("items")
            .select("product_id, item_category")
            .in("product_id", productIds)
            .eq("household_id", householdId)
            .is("consumed_at", null)
            .is("discarded_at", null)
        : Promise.resolve({ data: [] }),
      names.length > 0
        ? supabase
            .from("items")
            .select("custom_name, item_category")
            .eq("household_id", householdId)
            .is("consumed_at", null)
            .is("discarded_at", null)
            .not("custom_name", "is", null)
        : Promise.resolve({ data: [] }),
    ]);

    const productIdToType = new Map<string, string>();
    for (const si of byProductId.data ?? []) {
      if (si.product_id && si.item_category) productIdToType.set(si.product_id, si.item_category);
    }
    const nameToType = new Map<string, string>();
    for (const si of byName.data ?? []) {
      if (si.custom_name && si.item_category) {
        nameToType.set(si.custom_name.toLowerCase(), si.item_category);
      }
    }

    for (const r of nullTyped) {
      const inferred =
        (r.product_id ? productIdToType.get(r.product_id) : undefined) ??
        (r.custom_name ? nameToType.get(r.custom_name.toLowerCase()) : undefined);
      if (inferred) inferredItemCategory.set(r.id, inferred);
    }
  }

  const open: ShoppingEntry[] = [];
  const recent: ShoppingEntry[] = [];
  for (const row of itemsResult.data ?? []) {
    const entry: ShoppingEntry = {
      id: row.id,
      customName: row.custom_name,
      quantity: row.quantity != null ? Number(row.quantity) : null,
      unit: row.unit,
      note: row.note,
      addedAt: row.added_at,
      boughtAt: row.bought_at,
      productId: row.product_id,
      productName: row.product?.name ?? null,
      brand: row.product?.brand ?? row.brand ?? null,
      imageUrl: row.product?.image_url ?? row.image_url ?? null,
      category: row.product?.category ?? row.category ?? null,
      itemCategory: (row.item_category ?? inferredItemCategory.get(row.id) ?? "food") as ShoppingEntry["itemCategory"],
    };
    if (row.bought_at) recent.push(entry);
    else open.push(entry);
  }

  recent.sort((a, b) => (b.boughtAt ?? "").localeCompare(a.boughtAt ?? ""));

  return { open, recent, categories, error: null };
}
