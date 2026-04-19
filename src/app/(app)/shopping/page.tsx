import type { Metadata } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getActiveHouseholdId } from "@/lib/households/active";
import type { Database } from "@/lib/supabase/database.types";
import { ShoppingList, type ShoppingEntry } from "./shopping-list";
import { HouseholdSwitcher } from "../_header/household-switcher";
import { listMemberships } from "@/lib/households/active";

export const metadata: Metadata = { title: "Einkaufsliste" };

/**
 * Shopping list page.
 *
 * Server component — loads **open** items (bought_at is null) plus a
 * short 7-day history of recently bought items. The secondary bucket
 * exists mainly so the "In den Vorrat" handover has somewhere to live
 * after the user checks an item off: we don't delete the row, we grey
 * it out in "Zuletzt gekauft" with a primary button to move it into
 * Stock proper.
 *
 * Scoped explicitly to the active household for the same reason the
 * main list is: a user in household B should never see household A's
 * entries even if RLS would technically allow it post-join.
 */
export default async function ShoppingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <UnauthedState />;

  const [activeHouseholdId, memberships] = await Promise.all([
    getActiveHouseholdId(supabase, user.id),
    listMemberships(supabase, user.id),
  ]);

  const { open, recent, error } = activeHouseholdId
    ? await loadShoppingEntries(supabase, activeHouseholdId)
    : { open: [] as ShoppingEntry[], recent: [] as ShoppingEntry[], error: null };

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <div className="mb-3">
        <HouseholdSwitcher memberships={memberships} activeId={activeHouseholdId} />
      </div>
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Einkaufsliste</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Was noch fehlt. Abgehakte Artikel bleiben 7 Tage sichtbar.
        </p>
      </header>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          Konnte Liste nicht laden: {error}
        </div>
      ) : (
        <ShoppingList open={open} recent={recent} />
      )}
    </div>
  );
}

function UnauthedState() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <p className="text-sm text-muted-foreground">
        Bitte melde dich an, um deine Einkaufsliste zu sehen.
      </p>
    </div>
  );
}

/**
 * Pull all shopping-list rows for the household and split them into
 * "open" and "recently bought" buckets. The 7-day cutoff matches the
 * header copy — items older than that drop off the UI entirely (they
 * still exist in the DB if we ever want an "alle Einkäufe" view).
 */
async function loadShoppingEntries(
  supabase: SupabaseClient<Database>,
  householdId: string,
): Promise<{
  open: ShoppingEntry[];
  recent: ShoppingEntry[];
  error: string | null;
}> {
  // Single query pulls everything; we partition client-side to avoid a
  // second round-trip for the tiny recent list.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);

  const { data, error } = await supabase
    .from("shopping_list_items")
    .select(
      `
      id, custom_name, quantity, unit, note, added_at, bought_at, product_id,
      product:products ( id, name, brand, image_url, category )
      `,
    )
    .eq("household_id", householdId)
    .or(`bought_at.is.null,bought_at.gte.${cutoff.toISOString()}`)
    // Natural order: newest-added on top for the open list; PostgREST
    // preserves this when we filter client-side, so no second `.order`
    // is required.
    .order("added_at", { ascending: false });

  if (error)
    return { open: [], recent: [], error: error.message };

  const open: ShoppingEntry[] = [];
  const recent: ShoppingEntry[] = [];
  for (const row of data ?? []) {
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
      brand: row.product?.brand ?? null,
      imageUrl: row.product?.image_url ?? null,
      category: row.product?.category ?? null,
    };
    if (row.bought_at) recent.push(entry);
    else open.push(entry);
  }

  // Recent: newest-bought first, not newest-added. Re-sort.
  recent.sort((a, b) => (b.boughtAt ?? "").localeCompare(a.boughtAt ?? ""));

  return { open, recent, error: null };
}
