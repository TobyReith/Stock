"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ItemRow } from "./item-row";
import { daysUntil, mhdUrgency, type MhdUrgency } from "@/lib/date";

/**
 * Flat projection of the items+product join that the list needs.
 * Kept JSON-serializable (string ISO for best_before) so we can hand it
 * straight across the server→client boundary without rehydration.
 */
export type ListItem = {
  id: string;
  quantity: number;
  unit: string | null;
  bestBefore: string; // YYYY-MM-DD
  location: "fridge" | "pantry" | "freezer" | "other";
  customName: string | null;
  productName: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
};

type Props = {
  items: ListItem[];
};

/**
 * Interactive list shell: search + grouped rendering.
 *
 * Grouping strategy:
 *   - Three visual buckets by MHD urgency. Within each bucket, items
 *     stay in the sort order the server picked (best_before asc).
 *   - Search is a client-side substring filter across display name
 *     (customName ?? productName) and brand. No debounce needed — the
 *     lists are small (<100 items for most households).
 *
 * The search input controls an ephemeral state that resets on refresh —
 * not worth persisting in the URL at this stage.
 */
export function ItemsList({ items }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const name = (item.customName ?? item.productName).toLowerCase();
      const brand = (item.brand ?? "").toLowerCase();
      return name.includes(q) || brand.includes(q);
    });
  }, [items, query]);

  const groups = useMemo(() => groupByUrgency(filtered), [filtered]);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          placeholder="Durchsuchen…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8 pr-8"
          aria-label="Vorrat durchsuchen"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Suche leeren"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      {filtered.length === 0 && query && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Keine Treffer für &quot;{query}&quot;.
        </p>
      )}

      {groups.map(({ urgency, label, items: bucket }) =>
        bucket.length === 0 ? null : (
          <section key={urgency} className="flex flex-col gap-2">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </h2>
            <ul className="flex flex-col gap-2">
              {bucket.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/item/${item.id}`}
                    className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ItemRow
                      item={item}
                      daysLeft={daysUntil(item.bestBefore)}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}

type Group = {
  urgency: MhdUrgency;
  label: string;
  items: ListItem[];
};

/**
 * Split items into the three urgency buckets, preserving input order.
 *
 * Returns all three groups even when empty — the caller decides what to
 * render, which keeps the label order stable regardless of which
 * buckets have content today.
 */
function groupByUrgency(items: ListItem[]): Group[] {
  const expired: ListItem[] = [];
  const soon: ListItem[] = [];
  const later: ListItem[] = [];
  const now = new Date();

  for (const item of items) {
    const bucket = mhdUrgency(item.bestBefore, now);
    if (bucket === "expired") expired.push(item);
    else if (bucket === "soon") soon.push(item);
    else later.push(item);
  }

  return [
    { urgency: "expired", label: "Abgelaufen", items: expired },
    { urgency: "soon", label: "Bald fällig", items: soon },
    { urgency: "later", label: "Später", items: later },
  ];
}
