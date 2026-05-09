import Link from "next/link";
import { cn } from "@/lib/utils";
import type { RangeKey } from "./timeframe-toggle";

export type ViewKey = "history" | "stats";

export function ViewToggle({
  current,
  range,
}: {
  current: ViewKey;
  range: RangeKey;
}) {
  const rangeParam = range === "30" ? "" : `&range=${range}`;

  return (
    <nav
      aria-label="Ansicht"
      className="grid grid-cols-2 gap-1 rounded-lg border border-border p-1"
    >
      <Link
        href={`/stats${rangeParam}`}
        aria-current={current === "history" ? "page" : undefined}
        className={cn(
          "rounded-lg py-1.5 text-center text-xs font-medium transition-colors",
          current === "history"
            ? "bg-primary text-primary-fg"
            : "text-muted hover:bg-surface-raised hover:text-foreground",
        )}
      >
        Historie
      </Link>
      <Link
        href={`/stats?view=stats${rangeParam}`}
        aria-current={current === "stats" ? "page" : undefined}
        className={cn(
          "rounded-lg py-1.5 text-center text-xs font-medium transition-colors",
          current === "stats"
            ? "bg-primary text-primary-fg"
            : "text-muted hover:bg-surface-raised hover:text-foreground",
        )}
      >
        Statistik
      </Link>
    </nav>
  );
}
