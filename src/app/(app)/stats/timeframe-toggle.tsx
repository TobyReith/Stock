import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ViewKey } from "./view-toggle";

export const RANGE_DAYS = {
  "30": 30,
  "90": 90,
} as const;

export type RangeKey = "30" | "90" | "all";

const OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "30", label: "30 Tage" },
  { key: "90", label: "90 Tage" },
  { key: "all", label: "Gesamt" },
];

export function TimeframeToggle({
  current,
  view,
}: {
  current: RangeKey;
  view: ViewKey;
}) {
  const viewParam = view === "stats" ? "view=stats&" : "";

  return (
    <nav
      aria-label="Zeitraum"
      className="grid grid-cols-3 gap-1 rounded-lg border p-1"
    >
      {OPTIONS.map(({ key, label }) => {
        const active = key === current;
        const rangeParam = key === "30" ? "" : `range=${key}`;
        const query = [viewParam, rangeParam].filter(Boolean).join("");
        const href = query ? `/stats?${query}` : "/stats";

        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md py-1.5 text-center text-xs transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
