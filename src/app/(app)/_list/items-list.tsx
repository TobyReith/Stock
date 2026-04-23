"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ItemRow } from "./item-row";
import { FiltersSheet } from "./filters-sheet";
import type { CategoryDisplay } from "@/lib/schemas/categories";
import { daysUntil, mhdUrgency, type MhdUrgency } from "@/lib/date";
import { useFilterState } from "@/lib/hooks/use-filter-state";
import { applyItemFilters, applyItemSort } from "@/lib/filters/items";
import { isDefaultFilterState } from "@/lib/schemas/filters";

/**
 * Flat projection of the items+product join that the list needs.
 * Kept JSON-serializable (string ISO dates) so we can hand it straight
 * across the server→client boundary without rehydration.
 */
export type ListItem = {
  id: string;
  quantity: number;
  unit: string | null;
  bestBefore: string; // YYYY-MM-DD
  updatedAt: string; // ISO timestamp
  location: "fridge" | "pantry" | "freezer" | "other";
  customName: string | null;
  productName: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
};

type Props = {
  items: ListItem[];
  categories: CategoryDisplay[];
};

/**
 * Interactive list shell: search + filter/sort + grouped rendering.
 *
 * Pipeline (cheap enough to rerun on every keystroke — lists are small,
 * <100 items for most households — so no debounce):
 *
 *   items
 *     → applyItemFilters (URL-driven chips: category / location / urgency)
 *     → substring search (ephemeral local state)
 *     → applyItemSort    (URL-driven sort key + direction)
 *     → [optional] groupByUrgency
 *
 * Grouping is only applied when sorting by MHD — the urgency headers
 * sit naturally on top of a chronological order. Any other sort (name,
 * brand, updated) would fight the groups, so we render a flat list
 * instead.
 *
 * The search is kept as local state (not in the URL) because it's a
 * transient "I'm looking for something right now" action — unlike
 * filter chips, a shared link with a half-typed query in it would be
 * more confusing than useful.
 */
export function ItemsList({ items, categories }: Props) {
  const { state } = useFilterState();
  const [query, setQuery] = useState("");

  // Snapshot `now` once per render so the filter pass and the grouping
  // pass can't disagree on a midnight-edge case.
  const now = useMemo(() => new Date(), []);

  const filtered = useMemo(() => {
    const base = applyItemFilters(items, state, now);
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((item) => {
      const name = (item.customName ?? item.productName).toLowerCase();
      const brand = (item.brand ?? "").toLowerCase();
      return name.includes(q) || brand.includes(q);
    });
  }, [items, state, now, query]);

  const sorted = useMemo(
    () => applyItemSort(filtered, state.sort, state.dir),
    [filtered, state.sort, state.dir],
  );

  const groupByMhd = state.sort === "mhd";
  const groups = useMemo(
    () => (groupByMhd ? groupByUrgency(sorted, now) : null),
    [groupByMhd, sorted, now],
  );

  const hasActiveFilters = !isDefaultFilterState(state);
  const hasQuery = query.trim().length > 0;
  const showNoResults = sorted.length === 0 && (hasActiveFilters || hasQuery);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
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
        <FiltersSheet categories={categories} />
      </div>

      {showNoResults && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {hasQuery
            ? `Keine Treffer für "${query}".`
            : "Keine Artikel für diese Filter."}
        </p>
      )}

      {groups
        ? groups.map(({ urgency, label, items: bucket }) =>
            bucket.length === 0 ? null : (
              <section key={urgency} className="flex flex-col gap-2">
                <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {label}
                </h2>
                <ItemLinks items={bucket} />
              </section>
            ),
          )
        : sorted.length > 0 && <ItemLinks items={sorted} />}
    </div>
  );
}

function ItemLinks({ items }: { items: ListItem[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={`/item/${item.id}`}
            className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ItemRow item={item} daysLeft={daysUntil(item.bestBefore)} />
          </Link>
        </li>
      ))}
    </ul>
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
function groupByUrgency(items: ListItem[], now: Date): Group[] {
  const expired: ListItem[] = [];
  const soon: ListItem[] = [];
  const later: ListItem[] = [];

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
