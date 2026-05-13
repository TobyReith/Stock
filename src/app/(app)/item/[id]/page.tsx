import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/session";
import { getActiveHouseholdId } from "@/lib/households/active";
import { buttonVariants } from "@/components/ui/button";
import { EditItemForm, type DetailItem } from "./edit-item-form";
import type { ItemCategoryType } from "@/lib/schemas/items";
import { DeleteItemButton } from "./delete-item-button";
import { AddToShoppingButton } from "./add-to-shopping-button";
import type { CategoryDisplay } from "@/lib/schemas/categories";
import type { StorageLocationDisplay } from "@/lib/schemas/storage-locations";

/**
 * Item detail page.
 *
 * Server component — fetch the item (with joined product) in one hop,
 * hand a flat, JSON-friendly object to the client form.
 *
 * Authorization: we filter on the **active household** id in addition
 * to the item id. RLS (`items_select_members`) already blocks rows from
 * households the user doesn't belong to, but once a user joins more
 * than one household, pasting a URL for an item in the inactive one
 * should 404 — otherwise edits from this page would silently apply to
 * a household the user isn't currently viewing.
 *
 * We also refuse to load closed items (consumed / discarded) so users
 * can't accidentally edit "historical" rows. Phase 1 has no history
 * view yet, so the only way to get here is via the main list which
 * only lists open items.
 */
export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Both helpers are `cache()`-wrapped — the layout already resolved the
  // user, so this call is free; same for `createClient()`.
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  if (!user) return notFound();

  const activeHouseholdId = await getActiveHouseholdId(supabase, user.id);
  if (!activeHouseholdId) return notFound();

  const [itemResult, categoriesData, storageLocationsData] = await Promise.all([
    supabase
      .from("items")
      .select(
        `
        id, quantity, unit, best_before, location, custom_name,
        custom_brand, custom_category, note, item_category,
        consumed_at, discarded_at, added_at, frozen_at,
        product:products ( id, name, brand, category, image_url, barcode )
        `,
      )
      .eq("id", id)
      .eq("household_id", activeHouseholdId)
      .maybeSingle(),
    supabase
      .from("categories")
      .select("id, name, icon, color, sort_order, is_system, slug, parent_category")
      .eq("household_id", activeHouseholdId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("storage_locations")
      .select("id, name, icon, slug, sort_order, is_system, temperature_hint, storage_location_categories(category)")
      .eq("household_id", activeHouseholdId)
      .order("sort_order", { ascending: true }),
  ]);

  const { data, error } = itemResult;

  // Either not found, not allowed by RLS, or fetch error — all collapse
  // into a 404. `error.code === 'PGRST116'` specifically means no rows
  // but we treat any error as 404 to avoid leaking internals.
  if (error || !data) return notFound();
  if (data.consumed_at || data.discarded_at) return notFound();

  const categories: CategoryDisplay[] = (categoriesData.data ?? []).map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    icon: c.icon,
    color: c.color,
    sortOrder: c.sort_order,
    isSystem: c.is_system,
    parentCategory: c.parent_category,
  }));

  const storageLocations: StorageLocationDisplay[] = (storageLocationsData.data ?? []).map((l) => ({
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

  const item: DetailItem = {
    id: data.id,
    quantity: Number(data.quantity),
    unit: data.unit,
    bestBefore: data.best_before,
    location: data.location as DetailItem["location"],
    itemCategory: (data.item_category as ItemCategoryType | null) ?? "food",
    customName: data.custom_name,
    customBrand: data.custom_brand,
    customCategory: data.custom_category,
    note: data.note,
    productId: data.product?.id ?? null,
    productName: data.product?.name ?? "Unbekannt",
    brand: data.product?.brand ?? null,
    category: data.product?.category ?? null,
    imageUrl: data.product?.image_url ?? null,
    barcode: data.product?.barcode ?? null,
    frozenAt: data.frozen_at,
  };

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <div className="mb-4">
        <Link
          href="/"
          className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2" })}
        >
          <ChevronLeft aria-hidden /> Zurück
        </Link>
      </div>
      <EditItemForm item={item} categories={categories} storageLocations={storageLocations} />

      {/*
        Secondary actions live outside `EditItemForm` because they're
        escape hatches, not part of the normal edit → save → close
        cycle. Two buttons side by side, ghost-styled, below a divider
        so users land here deliberately instead of by a fat-thumb miss
        on the close actions.
      */}
      <div className="mt-6 flex justify-center gap-2 border-t border-border pt-4">
        <AddToShoppingButton
          productId={item.productId}
          productName={item.productName}
          customName={item.customName}
          brand={item.brand}
          imageUrl={item.imageUrl}
          category={item.category}
          quantity={item.quantity}
          unit={item.unit}
        />
        <DeleteItemButton
          itemId={item.id}
          itemName={item.customName ?? item.productName}
        />
      </div>
    </div>
  );
}
