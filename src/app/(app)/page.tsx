import Link from "next/link";
import { ChefHat, Package, Plus } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/session";
import { getActiveHouseholdId } from "@/lib/households/active";
import type { Database } from "@/lib/supabase/database.types";
import { ItemsList, type ListItem } from "./_list/items-list";
import type { CategoryDisplay } from "@/lib/schemas/categories";
import type { StorageLocationDisplay } from "@/lib/schemas/storage-locations";
import { buttonVariants } from "@/components/ui/button";

export default async function ListPage() {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  if (!user) return <UnauthedState />;

  const activeHouseholdId = await getActiveHouseholdId(supabase, user.id);

  const [result, categories, storageLocations] = activeHouseholdId
    ? await Promise.all([
        loadOpenItems(supabase, activeHouseholdId),
        loadCategories(supabase, activeHouseholdId),
        loadStorageLocations(supabase, activeHouseholdId),
      ])
    : [
        { items: [] as ListItem[], error: null },
        [] as CategoryDisplay[],
        [] as StorageLocationDisplay[],
      ];

  if (result.error) return <ErrorState message={result.error} />;
  const items = result.items;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Vorrat</h1>
        <span className="text-sm text-muted-foreground">
          {items.length} {items.length === 1 ? "Artikel" : "Artikel"}
        </span>
      </header>

      {items.length > 0 && <ExpiryWidget items={items} />}
      {items.length === 0 ? <EmptyState /> : <ItemsList items={items} categories={categories} storageLocations={storageLocations} />}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-16 text-center">
      <Package className="size-12 text-muted-foreground" aria-hidden />
      <h2 className="mt-4 text-lg font-medium">Noch nichts im Vorrat</h2>
      <p className="mt-2 max-w-xs text-sm text-muted-foreground">
        Tippe unten auf <span className="font-medium">Hinzufügen</span>, um
        deinen ersten Artikel zu scannen.
      </p>
      <Link href="/add" className={buttonVariants({ size: "sm", className: "mt-6" })}>
        <Plus aria-hidden /> Ersten Artikel hinzufügen
      </Link>
    </div>
  );
}

function UnauthedState() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <p className="text-sm text-muted-foreground">
        Bitte melde dich an, um deinen Vorrat zu sehen.
      </p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Vorrat</h1>
      <div
        role="alert"
        className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      >
        Konnte Vorrat nicht laden: {message}
      </div>
    </div>
  );
}

function ExpiryWidget({ items }: { items: ListItem[] }) {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + 5);
  const thresholdStr = threshold.toISOString().slice(0, 10);

  const expiring = items.filter(
    (i) => i.bestBefore && i.bestBefore <= thresholdStr,
  );
  if (expiring.length === 0) return null;

  return (
    <Link
      href="/recipes"
      className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 transition-colors hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-900/20 dark:hover:bg-amber-900/30"
    >
      <div className="flex items-center gap-3">
        <ChefHat className="size-5 text-amber-600 dark:text-amber-400" aria-hidden />
        <div>
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            {expiring.length} {expiring.length === 1 ? "Artikel läuft" : "Artikel laufen"} bald ab
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Rezeptideen ansehen →
          </p>
        </div>
      </div>
    </Link>
  );
}

async function loadStorageLocations(
  supabase: SupabaseClient<Database>,
  householdId: string,
): Promise<StorageLocationDisplay[]> {
  const { data } = await supabase
    .from("storage_locations")
    .select("id, name, icon, slug, sort_order, is_system, temperature_hint")
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
  }));
}

async function loadCategories(
  supabase: SupabaseClient<Database>,
  householdId: string,
): Promise<CategoryDisplay[]> {
  const { data } = await supabase
    .from("categories")
    .select("id, name, icon, color, sort_order, is_system, slug")
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
  }));
}

async function loadOpenItems(
  supabase: SupabaseClient<Database>,
  householdId: string,
): Promise<{ items: ListItem[]; error: string | null }> {
  const { data, error } = await supabase
    .from("items")
    .select(
      `
      id, quantity, unit, best_before, location, custom_name,
      custom_brand, custom_category, added_at, updated_at,
      product:products ( id, name, brand, category, image_url )
      `,
    )
    .eq("household_id", householdId)
    .is("consumed_at", null)
    .is("discarded_at", null)
    .order("best_before", { ascending: true });

  if (error) return { items: [], error: error.message };

  const items: ListItem[] = (data ?? []).map((row) => ({
    id: row.id,
    quantity: Number(row.quantity),
    unit: row.unit,
    bestBefore: row.best_before,
    updatedAt: row.updated_at,
    location: row.location as ListItem["location"],
    customName: row.custom_name,
    productName: row.product?.name ?? "Unbekannt",
    brand: row.custom_brand ?? row.product?.brand ?? null,
    category: row.custom_category ?? row.product?.category ?? null,
    imageUrl: row.product?.image_url ?? null,
  }));
  return { items, error: null };
}
