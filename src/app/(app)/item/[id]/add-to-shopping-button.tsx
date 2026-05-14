"use client";

import { useTransition } from "react";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addShoppingItem } from "@/lib/actions/shopping";

/**
 * "Auf Einkaufsliste" action on the item detail page.
 *
 * Adds a shopping-list entry that carries the product reference when
 * available, so the eventual "Gekauft → zum Vorrat" handover can pre-
 * fill the add-flow with the exact same product. Quantity + unit come
 * from the current item as a sensible default — the user tends to buy
 * the same pack size they already had.
 *
 * Success toast includes a link to the shopping list so the user can
 * verify / tweak without hunting in the bottom nav.
 */
export function AddToShoppingButton({
  productId,
  productName,
  customName,
  brand,
  imageUrl,
  category,
  itemCategory,
  quantity,
  unit,
}: {
  productId: string | null;
  productName: string;
  customName: string | null;
  brand: string | null;
  imageUrl: string | null;
  category: string | null;
  itemCategory: string;
  quantity: number;
  unit: string | null;
}) {
  const [pending, startTransition] = useTransition();

  function handleAdd() {
    // Prefer the user-facing display name as the stored `customName` so
    // the shopping list shows "Opas Honig" rather than the generic
    // product name. When only the generic name exists we pass it through
    // so free-text rendering still reads correctly even if the product
    // cache row later shifts.
    const displayName = (customName ?? productName).trim();

    startTransition(async () => {
      const res = await addShoppingItem({
        productId: productId ?? undefined,
        customName: displayName || undefined,
        brand: brand ?? undefined,
        imageUrl: imageUrl ?? undefined,
        category: category ?? undefined,
        itemCategory: itemCategory as "food" | "hygiene" | "medicine" | "other",
        quantity: quantity > 0 ? quantity : undefined,
        unit: unit ?? undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Zur Einkaufsliste hinzugefügt", {
        duration: 5000,
        action: {
          label: "Ansehen",
          // Wrap the Link navigation in a synthetic click so sonner
          // still dismisses the toast on tap.
          onClick: () => {
            window.location.href = "/shopping";
          },
        },
      });
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleAdd}
      disabled={pending}
    >
      <ShoppingCart aria-hidden /> Auf Einkaufsliste
    </Button>
  );
}

/**
 * Passive link alternative for contexts where we already know the user
 * wants to go to the list (after a successful add, the toast action).
 * Kept alongside the button so callers don't re-implement the href.
 */
export function ShoppingListLink({ children }: { children: React.ReactNode }) {
  return (
    <Link href="/shopping" className="underline underline-offset-2">
      {children}
    </Link>
  );
}
