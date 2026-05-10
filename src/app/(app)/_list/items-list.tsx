"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Package, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SwipeableItemRow } from "./swipeable-item-row";
import { FiltersSheet } from "./filters-sheet";
import type { CategoryDisplay } from "@/lib/schemas/categories";
import type { StorageLocationDisplay } from "@/lib/schemas/storage-locations";
import { daysUntil, mhdUrgency, type MhdUrgency } from "@/lib/date";
import { useFilterState } from "@/lib/hooks/use-filter-state";
import { applyItemFilters, applyItemSort } from "@/lib/filters/items";
import { isDefaultFilterState } from "@/lib/schemas/filters";
import { cn } from "@/lib/utils";
import type { ItemCategoryType } from "@/lib/schemas/items";

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
  location: string;
  customName: string | null;
  productName: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  frozenAt: string | null; // YYYY-MM-DD
  itemCategory: ItemCategoryType;
};

const CATEGORY_TABS = [
  { key: "food" as const, label: "Lebensmittel", emoji: "🥦" },
  { key: "hygiene" as const, label: "Hygiene", emoji: "🧴" },
  { key: "medicine" as const, label: "Medikamente", emoji: "💊" },
] satisfies { key: ItemCategoryType; label: string; emoji: string }[];

type Props = {
  items: ListItem[];
  categories: CategoryDisplay[];
  storageLocations: StorageLocationDisplay[];
};

/**
 * Interactive list shell: category tabs + search + filter/sort + grouped rendering.
 *
 * Pipeline:
 *   items
 *     → tab filter       (active itemCategory tab — local state)
 *     → applyItemFilters (URL-driven chips: category / location / urgency)
 *     → substring search (ephemeral local state)
 *     → applyItemSort    (URL-driven sort key + direction)
 *     → [optional] groupByUrgency
 */
export function ItemsList({ items, categories, storageLocations }: Props) {
  const { state } = useFilterState();
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<ItemCategoryType>("food");

  // Snapshot `now` once per render so the filter pass and the grouping
  // pass can't disagree on a midnight-edge case.
  const now = useMemo(() => new Date(), []);

  const filtered = useMemo(() => {
    const byTab = items.filter((i) => i.itemCategory === activeTab);
    const base = applyItemFilters(byTab, state, now);
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((item) => {
      const name = (item.customName ?? item.productName).toLowerCase();
      const brand = (item.brand ?? "").toLowerCase();
      return name.includes(q) || brand.includes(q);
    });
  }, [items, activeTab, state, now, query]);

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
      {/* Category tabs */}
      <div
        role="tablist"
        aria-label="Kategorie"
        className="flex gap-1 rounded-xl bg-surface-raised p-1"
      >
        {CATEGORY_TABS.map(({ key, label, emoji }) => {
          const count = items.filter((i) => i.itemCategory === key).length;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={activeTab === key}
              type="button"
              onClick={() => {
                setActiveTab(key);
                setQuery("");
              }}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
                activeTab === key
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted hover:text-foreground",
              )}
            >
              <span aria-hidden>{emoji}</span>
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{label.split(" ")[0]}</span>
              {count > 0 && (
                <span
                  className={cn(
                    "ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                    activeTab === key
                      ? "bg-primary-subtle text-primary-text"
                      : "bg-border text-muted",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted"
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
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
        <FiltersSheet categories={categories} storageLocations={storageLocations} />
      </div>

      {showNoResults && (
        <p className="py-6 text-center text-sm text-muted">
          {hasQuery
            ? `Keine Treffer für "${query}".`
            : "Keine Artikel für diese Filter."}
        </p>
      )}

      {!showNoResults && sorted.length === 0 && !hasActiveFilters && !hasQuery && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <Package className="size-10 text-muted" aria-hidden />
          <p className="mt-3 text-sm font-medium">
            Keine {CATEGORY_TABS.find((t) => t.key === activeTab)?.label ?? "Artikel"}
          </p>
          <p className="mt-1 text-xs text-muted">
            Tippe unten auf <span className="font-medium">+</span> um einen Artikel hinzuzufügen.
          </p>
          <Link
            href={`/add?cat=${activeTab}`}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-fg hover:bg-sage-400"
          >
            Jetzt hinzufügen
          </Link>
        </div>
      )}

      {groups
        ? groups.map(({ urgency, label, items: bucket }) =>
            bucket.length === 0 ? null : (
              <section key={urgency} className="flex flex-col gap-2">
                <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                  {label}
                </h2>
                <ItemLinks items={bucket} storageLocations={storageLocations} />
              </section>
            ),
          )
        : sorted.length > 0 && <ItemLinks items={sorted} storageLocations={storageLocations} />}
    </div>
  );
}

function ItemLinks({ items, storageLocations }: { items: ListItem[]; storageLocations: StorageLocationDisplay[] }) {
  return (
    <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
      {items.map((item) => (
        <li key={item.id}>
          <SwipeableItemRow
            item={item}
            daysLeft={daysUntil(item.bestBefore)}
            storageLocations={storageLocations}
          />
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
