import Link from "next/link";
import { cn } from "@/lib/utils";
import type { RangeKey } from "./timeframe-toggle";

export type ArtKey = "food" | "hygiene" | "medicine";

const OPTIONS: { key: ArtKey; label: string; emoji: string }[] = [
  { key: "food",     label: "Essen",   emoji: "🥦" },
  { key: "hygiene",  label: "Hygiene", emoji: "🧴" },
  { key: "medicine", label: "Medizin", emoji: "💊" },
];

export function ArtToggle({
  current,
  range,
}: {
  current: ArtKey;
  range: RangeKey;
}) {
  const rangeParam = range === "30" ? "" : `range=${range}`;

  return (
    <nav
      aria-label="Art"
      className="grid grid-cols-3 gap-1 rounded-lg border border-border p-1"
    >
      {OPTIONS.map(({ key, label, emoji }) => {
        const active = key === current;
        const artParam = key === "food" ? "" : `art=${key}`;
        const params = [artParam, rangeParam].filter(Boolean).join("&");
        const href = params ? `/stats?${params}` : "/stats";

        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-lg py-1.5 text-center text-xs transition-colors",
              active
                ? "bg-primary text-primary-fg"
                : "text-muted hover:bg-surface-raised hover:text-foreground",
            )}
          >
            <span aria-hidden className="mr-1">{emoji}</span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
