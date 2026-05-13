import type { Metadata } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/session";
import { getActiveHouseholdId } from "@/lib/households/active";
import type { Database } from "@/lib/supabase/database.types";
import { ShoppingList, type ShoppingEntry } from "./shopping-list";

export const metadata: Metadata = { title: "Einkauf" };

export default async function ShoppingPage() {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  if (!user) return <UnauthedState />;

  const activeHouseholdId = await getActiveHouseholdId(supabase, user.id);

  const { open, recent, error } = activeHouseholdId
    ? await loadShoppingEntries(supabase, activeHouseholdId)
    : { open: [] as ShoppingEntry[], recent: [] as ShoppingEntry[], error: null };

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
        <ShoppingList open={open} recent={recent} />
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
  error: string | null;
}> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);

  const { data, error } = await supabase
    .from("shopping_list_items")
    .select(
      `
      id, custom_name, brand, image_url, quantity, unit, note, added_at, bought_at, product_id,
      product:products ( id, name, brand, image_url, category )
      `,
    )
    .eq("household_id", householdId)
    .or(`bought_at.is.null,bought_at.gte.${cutoff.toISOString()}`)
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
      brand: row.product?.brand ?? row.brand ?? null,
      imageUrl: row.product?.image_url ?? row.image_url ?? null,
      category: row.product?.category ?? null,
    };
    if (row.bought_at) recent.push(entry);
    else open.push(entry);
  }

  recent.sort((a, b) => (b.boughtAt ?? "").localeCompare(a.boughtAt ?? ""));

  return { open, recent, error: null };
}
