import { formatMhdRelative } from "@/lib/date";
import { cn } from "@/lib/utils";
import { Package } from "lucide-react";
import type { ListItem } from "./items-list";
import type { StorageLocationDisplay } from "@/lib/schemas/storage-locations";

export function ItemRow({
  item,
  daysLeft,
  storageLocations,
}: {
  item: ListItem;
  daysLeft: number;
  storageLocations: StorageLocationDisplay[];
}) {
  const locationIcon =
    storageLocations.find((l) => l.slug === item.location)?.icon ?? "📦";
  const displayName = item.customName ?? item.productName;

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
          <span className="leading-none" aria-hidden>{locationIcon}</span>
          <span className={mhdColor}>{formatMhdRelative(daysLeft)}</span>
        </div>
      </div>
    </article>
  );
}

function formatQuantity(qty: number, unit: string | null): string {
  const num = Number.isInteger(qty) ? String(qty) : qty.toFixed(1);
  return unit ? `${num} ${unit}` : num;
}
