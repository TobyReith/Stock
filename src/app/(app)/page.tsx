import Link from "next/link";
import { Package, Plus, Settings } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getActiveHouseholdId, listMemberships } from "@/lib/households/active";
import type { Database } from "@/lib/supabase/database.types";
import { ItemsList, type ListItem } from "./_list/items-list";
import { HouseholdSwitcher } from "./_header/household-switcher";
import { buttonVariants } from "@/components/ui/button";

/**
 * Main "Vorrat" list.
 *
 * Server component — fetches the open items (not yet consumed or
 * discarded) scoped to the user's **active** household.
 *
 * Why the explicit `household_id` filter (vs leaning on RLS): once a
 * user joins more than one household, `items_select_members` would
 * return rows from every household they belong to. The list needs to
 * match whatever the household switcher has selected, so we scope
 * explicitly here.
 *
 * Fresh-user path: if the user has no household yet, we render the
 * empty state instead of bootstrapping from a Server Component. The
 * first `addItem` call takes care of creating "Mein Haushalt" via
 * `ensureActiveHousehold`.
 */
export default async function ListPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // `(app)/layout.tsx` already redirects unauthenticated users, so `!user`
  // is defensive. We bail with a friendly state instead of throwing.
  if (!user) return <UnauthedState />;

  // Parallel: active household id + the full membership list for the
  // switcher. Both read `household_members`, but pulling them separately
  // keeps each query focused and lets `getActiveHouseholdId` apply its
  // cookie-validation logic without re-walking the join.
  const [activeHouseholdId, memberships] = await Promise.all([
    getActiveHouseholdId(supabase, user.id),
    listMemberships(supabase, user.id),
  ]);
  const result = activeHouseholdId
    ? await loadOpenItems(supabase, activeHouseholdId)
    : { items: [] as ListItem[], error: null };

  if (result.error) return <ErrorState message={result.error} />;
  const items = result.items;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <div className="mb-3">
        <HouseholdSwitcher memberships={memberships} activeId={activeHouseholdId} />
      </div>
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Vorrat</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {items.length} {items.length === 1 ? "Artikel" : "Artikel"}
          </span>
          <Link
            href="/settings"
            aria-label="Einstellungen"
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
          >
            <Settings aria-hidden />
          </Link>
        </div>
      </header>

      {items.length === 0 ? <EmptyState /> : <ItemsList items={items} />}
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

/**
 * Pull open items for the given household + flatten the joined product
 * row into the `ListItem` shape the client list expects. Returns an
 * `error` string instead of throwing so the caller can pick between
 * error UI and the empty state.
 */
async function loadOpenItems(
  supabase: SupabaseClient<Database>,
  householdId: string,
): Promise<{ items: ListItem[]; error: string | null }> {
  const { data, error } = await supabase
    .from("items")
    .select(
      `
      id, quantity, unit, best_before, location, custom_name,
      custom_brand, custom_category, added_at,
      product:products ( id, name, brand, category, image_url )
      `,
    )
    .eq("household_id", householdId)
    .is("consumed_at", null)
    .is("discarded_at", null)
    .order("best_before", { ascending: true });

  if (error) return { items: [], error: error.message };

  // Coalesce per-item overrides onto the list shape. Downstream
  // components don't need to know about the override machinery — they
  // just see the effective brand/category.
  const items: ListItem[] = (data ?? []).map((row) => ({
    id: row.id,
    quantity: Number(row.quantity),
    unit: row.unit,
    bestBefore: row.best_before,
    location: row.location as ListItem["location"],
    customName: row.custom_name,
    productName: row.product?.name ?? "Unbekannt",
    brand: row.custom_brand ?? row.product?.brand ?? null,
    category: row.custom_category ?? row.product?.category ?? null,
    imageUrl: row.product?.image_url ?? null,
  }));
  return { items, error: null };
}
