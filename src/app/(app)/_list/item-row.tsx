import { Refrigerator, Package, Snowflake, Archive } from "lucide-react";
import { formatMhdRelative } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { ListItem } from "./items-list";

const LOCATION_ICONS: Record<ListItem["location"], React.ComponentType<{ className?: string }>> = {
  fridge: Refrigerator,
  pantry: Package,
  freezer: Snowflake,
  other: Archive,
};

/**
 * One row in the Vorrat list.
 *
 * Visual hierarchy:
 *   - Thumbnail (product image) or fallback category glyph on the left
 *   - Name + brand stacked in the middle (truncated)
 *   - Quantity on the right (compact)
 *   - Bottom row: location icon + MHD relative phrase with urgency color
 *
 * We color the MHD line (not the whole row) so the visual weight stays
 * on the product name. Overstuffed row backgrounds made the list feel
 * alarmist during prototyping.
 */
export function ItemRow({
  item,
  daysLeft,
}: {
  item: ListItem;
  daysLeft: number;
}) {
  const LocationIcon = LOCATION_ICONS[item.location];
  const displayName = item.customName ?? item.productName;

  // Color scale synchronized with `mhdUrgency()` buckets, minus the label —
  // the buckets' section headers already tell the user which tier it's in.
  const mhdColor = cn(
    daysLeft <= 0 && "text-destructive",
    daysLeft > 0 && daysLeft <= 3 && "text-amber-600 dark:text-amber-500",
    daysLeft > 3 && "text-muted-foreground",
  );

  return (
    <article className="flex items-start gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent">
      <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt=""
            className="size-full object-contain"
            loading="lazy"
          />
        ) : (
          <Package className="size-6 text-muted-foreground" aria-hidden />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium leading-tight">{displayName}</p>
            {item.brand && (
              <p className="truncate text-xs text-muted-foreground">
                {item.brand}
              </p>
            )}
          </div>
          <p className="shrink-0 text-sm tabular-nums text-muted-foreground">
            {formatQuantity(item.quantity, item.unit)}
          </p>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-xs">
          <LocationIcon className="size-3.5 text-muted-foreground" aria-hidden />
          <span className={mhdColor}>{formatMhdRelative(daysLeft)}</span>
        </div>
      </div>
    </article>
  );
}

/**
 * Render quantity + optional unit without a gap-like whitespace for
 * unitless counts. "1 Stück", "500 g", "2" — all read naturally.
 */
function formatQuantity(qty: number, unit: string | null): string {
  // Trim trailing ".0" from integers represented as floats.
  const num = Number.isInteger(qty) ? String(qty) : qty.toFixed(1);
  return unit ? `${num} ${unit}` : num;
}
