import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { EditItemForm, type DetailItem } from "./edit-item-form";

/**
 * Item detail page.
 *
 * Server component — fetch the item (with joined product) in one hop,
 * hand a flat, JSON-friendly object to the client form. RLS
 * (`items_select_member`) is our authorization boundary; if the user
 * doesn't belong to the item's household, the row won't come back and
 * we 404.
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
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("items")
    .select(
      `
      id, quantity, unit, best_before, location, custom_name, note,
      consumed_at, discarded_at, added_at,
      product:products ( id, name, brand, category, image_url, barcode )
      `,
    )
    .eq("id", id)
    .maybeSingle();

  // Either not found, not allowed by RLS, or fetch error — all collapse
  // into a 404. `error.code === 'PGRST116'` specifically means no rows
  // but we treat any error as 404 to avoid leaking internals.
  if (error || !data) return notFound();
  if (data.consumed_at || data.discarded_at) return notFound();

  const item: DetailItem = {
    id: data.id,
    quantity: Number(data.quantity),
    unit: data.unit,
    bestBefore: data.best_before,
    location: data.location as DetailItem["location"],
    customName: data.custom_name,
    note: data.note,
    productName: data.product?.name ?? "Unbekannt",
    brand: data.product?.brand ?? null,
    category: data.product?.category ?? null,
    imageUrl: data.product?.image_url ?? null,
    barcode: data.product?.barcode ?? null,
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
      <EditItemForm item={item} />
    </div>
  );
}
