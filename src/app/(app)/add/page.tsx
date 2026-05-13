import type { Metadata } from "next";
import { AddFlow, type AddFlowInitial } from "./add-flow";
import { ActiveHouseholdBadge } from "../_header/active-household-badge";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/session";
import { getActiveHouseholdId } from "@/lib/households/active";
import type { FormSeed } from "./item-form";
import type { CategoryDisplay } from "@/lib/schemas/categories";
import type { StorageLocationDisplay } from "@/lib/schemas/storage-locations";

export const metadata: Metadata = { title: "Hinzufügen" };

/**
 * Add-Flow page.
 *
 * Normally renders the scan → preview → form state machine. With
 * `?fromShopping=<uuid>` in the URL we pre-resolve the referenced
 * shopping-list row server-side and drop the user straight into the
 * form, pre-filled from that row. When the user submits, the flow
 * marks the source shopping row as bought so the "open" bucket shrinks
 * without a second action.
 *
 * We resolve server-side (not in the client) so the client bundle never
 * sees rows from inactive households even in the error case — RLS plus
 * explicit household scoping mean we can trust the fetched row.
 */
export default async function AddPage({
  searchParams,
}: {
  searchParams: Promise<{ fromShopping?: string; cat?: string }>;
}) {
  const { fromShopping, cat } = await searchParams;
  const initialItemCategory = ["food", "hygiene", "medicine", "other"].includes(cat ?? "")
    ? (cat as "food" | "hygiene" | "medicine" | "other")
    : "food";

  const [initial, categories, storageLocations] = await Promise.all([
    fromShopping ? resolveShoppingSeed(fromShopping) : Promise.resolve(null),
    loadPageCategories(),
    loadPageStorageLocations(),
  ]);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      {/*
       * For multi-household users: a passive indicator of which household
       * this new item will land in. Rendered above the title so it's the
       * first thing a user with 2+ households sees before committing to
       * the form.
       */}
      <div className="mb-3">
        <ActiveHouseholdBadge />
      </div>
      <header className="mb-6">
        <h1 className="font-serif text-[26px] font-medium tracking-tight">
          {initial ? "In den Vorrat" : "Hinzufügen"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {initial
            ? "Ergänze MHD & Lagerort — den Rest haben wir von der Einkaufsliste übernommen."
            : "Barcode scannen, MHD erfassen, fertig."}
        </p>
      </header>

      <AddFlow initial={initial ?? undefined} initialItemCategory={initialItemCategory} categories={categories} storageLocations={storageLocations} />
    </div>
  );
}

async function loadPageStorageLocations(): Promise<StorageLocationDisplay[]> {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  if (!user) return [];
  const householdId = await getActiveHouseholdId(supabase, user.id);
  if (!householdId) return [];
  const { data } = await supabase
    .from("storage_locations")
    .select("id, name, icon, slug, sort_order, is_system, temperature_hint, storage_location_categories(category)")
    .eq("household_id", householdId)
    .order("sort_order", { ascending: true });
  return (data ?? []).map((l) => ({
    id: l.id,
    slug: l.slug,
    name: l.name,
    icon: l.icon,
    sortOrder: l.sort_order,
    isSystem: l.is_system,
    temperatureHint: l.temperature_hint as StorageLocationDisplay["temperatureHint"],
    categories: (l.storage_location_categories ?? []).map(
      (c) => c.category as StorageLocationDisplay["categories"][number],
    ),
  }));
}

async function loadPageCategories(): Promise<CategoryDisplay[]> {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  if (!user) return [];
  const householdId = await getActiveHouseholdId(supabase, user.id);
  if (!householdId) return [];
  const { data } = await supabase
    .from("categories")
    .select("id, name, icon, color, sort_order, is_system, slug, parent_category")
    .eq("household_id", householdId)
    .order("sort_order", { ascending: true });
  return (data ?? []).map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    icon: c.icon,
    color: c.color,
    sortOrder: c.sort_order,
    isSystem: c.is_system,
    parentCategory: c.parent_category,
  }));
}

/**
 * Fetch a shopping-list row and build the Add-Flow bootstrap payload
 * from it. Returns `null` on any failure (row missing, RLS denied,
 * invalid id) — the page falls back to the normal scanner flow, which
 * is a fine UX even if we can't explain why the deeplink "didn't work".
 *
 * When the row has a `product_id` we seed as `known` with the joined
 * product fields. Otherwise we seed as `manual`, letting the form's
 * `prefill` pipeline push the free-text name into the productName input.
 */
async function resolveShoppingSeed(
  id: string,
): Promise<AddFlowInitial | null> {
  // Cheap UUID sanity check before hitting the DB — PostgREST would
  // return an error for malformed input anyway, but we bail early to
  // avoid a round-trip for "?fromShopping=garbage".
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;

  // Both helpers are `cache()`-wrapped — shares with the layout's
  // `getCurrentUser()` call at no extra cost.
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  if (!user) return null;

  const activeHouseholdId = await getActiveHouseholdId(supabase, user.id);
  if (!activeHouseholdId) return null;

  const { data, error } = await supabase
    .from("shopping_list_items")
    .select(
      `
      id, custom_name, quantity, unit,
      product:products ( id, name, brand, category, image_url, barcode )
      `,
    )
    .eq("id", id)
    .eq("household_id", activeHouseholdId)
    .maybeSingle();

  if (error || !data) return null;

  const prefill = {
    customName: data.custom_name ?? undefined,
    quantity: data.quantity != null ? Number(data.quantity) : undefined,
    unit: data.unit ?? undefined,
  };

  if (data.product) {
    const seed: FormSeed = {
      kind: "known",
      productId: data.product.id,
      productName: data.product.name,
      brand: data.product.brand,
      imageUrl: data.product.image_url,
      category: data.product.category ?? "other",
      barcode: data.product.barcode,
    };
    return { seed, prefill, shoppingListItemId: data.id };
  }

  // No product row — free-text entry on the shopping list. The form's
  // `prefill.customName` seeds the productName input in manual mode.
  return {
    seed: { kind: "manual" },
    prefill,
    shoppingListItemId: data.id,
  };
}
