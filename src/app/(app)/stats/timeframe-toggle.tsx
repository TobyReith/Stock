import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Simple URL-driven timeframe toggle.
 *
 * No client JS — each option is just a link back to `/stats?range=…`.
 * The server component re-renders with the new param. Fast enough
 * because the whole page is cheap (one RLS-scoped SELECT + a bit of
 * in-memory aggregation), and it keeps the page bundle minimal.
 */

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

export function TimeframeToggle({ current }: { current: RangeKey }) {
  return (
    <nav
      aria-label="Zeitraum"
      className="grid grid-cols-3 gap-1 rounded-lg border p-1"
    >
      {OPTIONS.map(({ key, label }) => {
        const active = key === current;
        return (
          <Link
            key={key}
            href={key === "30" ? "/stats" : `/stats?range=${key}`}
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
