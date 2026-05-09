import type * as React from "react";
import { formatMhdRelative } from "@/lib/date";
import { cn } from "@/lib/utils";
import { Package, Snowflake } from "lucide-react";
import type { ListItem } from "./items-list";
import type { StorageLocationDisplay } from "@/lib/schemas/storage-locations";

export function ItemRow({
  item,
  daysLeft,
  storageLocations,
  actions,
}: {
  item: ListItem;
  daysLeft: number;
  storageLocations: StorageLocationDisplay[];
  actions?: React.ReactNode;
}) {
  const locationIcon =
    storageLocations.find((l) => l.slug === item.location)?.icon ?? "📦";
  const displayName = item.customName ?? item.productName;

  const mhdColor = cn(
    daysLeft <= 0 && "text-danger",
    daysLeft > 0 && daysLeft <= 3 && "text-warning",
    daysLeft > 3 && "text-muted",
  );

  return (
    <article className="flex items-center gap-3 bg-surface px-3 py-2.5 transition-colors hover:bg-surface-raised">
      <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-raised">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt=""
            className="max-h-full max-w-full object-contain p-0.5"
            loading="lazy"
          />
        ) : (
          <Package className="size-5 text-muted" aria-hidden />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight">{displayName}</p>
            {item.brand && (
              <p className="truncate text-xs text-muted">
                {item.brand}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <p className="font-mono text-[13px] tabular-nums text-muted">
              {formatQuantity(item.quantity, item.unit)}
            </p>
            {actions}
          </div>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-xs">
          <span className="leading-none" aria-hidden>{locationIcon}</span>
          {item.frozenAt && (
            <Snowflake className="size-3 text-primary-text" aria-label="Eingefroren" />
          )}
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
