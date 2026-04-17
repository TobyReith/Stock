import Link from "next/link";
import { Package, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ItemsList, type ListItem } from "./_list/items-list";
import { buttonVariants } from "@/components/ui/button";

/**
 * Main "Vorrat" list.
 *
 * Server component — we fetch the open items (not yet consumed or
 * discarded) for the user's household on every request. Supabase RLS
 * automatically scopes to the household the user belongs to
 * (`items_select_member` policy), so no explicit householdId filter
 * needed here.
 *
 * The interactive bits (search, grouping header collapsing later on)
 * live in the client `ItemsList` — this component just hands it the
 * already-materialized row array.
 */
export default async function ListPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // `(app)/layout.tsx` already redirects unauthenticated users, so `!user`
  // is defensive. We bail with a friendly state instead of throwing.
  if (!user) return <UnauthedState />;

  // PostgREST nested select: pulls the joined product row in the same
  // trip. We alias it as `product` via the `products!inner` style — but
  // we stay with the default `product:products(...)` because items from
  // pre-cache manual paths still have a product row (addItem always
  // resolves or creates one before inserting).
  const { data, error } = await supabase
    .from("items")
    .select(
      `
      id, quantity, unit, best_before, location, custom_name, added_at,
      product:products ( id, name, brand, category, image_url )
      `,
    )
    .is("consumed_at", null)
    .is("discarded_at", null)
    .order("best_before", { ascending: true });

  if (error) {
    return <ErrorState message={error.message} />;
  }

  const items: ListItem[] = (data ?? []).map((row) => ({
    id: row.id,
    quantity: Number(row.quantity),
    unit: row.unit,
    bestBefore: row.best_before,
    location: row.location as ListItem["location"],
    customName: row.custom_name,
    productName: row.product?.name ?? "Unbekannt",
    brand: row.product?.brand ?? null,
    category: row.product?.category ?? null,
    imageUrl: row.product?.image_url ?? null,
  }));

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Vorrat</h1>
        <span className="text-sm text-muted-foreground">
          {items.length} {items.length === 1 ? "Artikel" : "Artikel"}
        </span>
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
