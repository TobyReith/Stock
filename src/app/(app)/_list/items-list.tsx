"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Package, Plus, Search, X } from "lucide-react";
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
  { key: "food" as const, label: "Lebensmittel", shortLabel: "Essen", emoji: "🥦" },
  { key: "hygiene" as const, label: "Hygiene", shortLabel: "Hygiene", emoji: "🧴" },
  { key: "medicine" as const, label: "Medikamente", shortLabel: "Medizin", emoji: "💊" },
] satisfies { key: ItemCategoryType; label: string; shortLabel: string; emoji: string }[];

type Props = {
  items: ListItem[];
  categories: CategoryDisplay[];
  storageLocations: StorageLocationDisplay[];
};

/**
 * Interactive list shell: category tabs + subcategory chips + search + filter/sort + grouped rendering.
 *
 * Pipeline:
 *   items
 *     → tab filter       (active itemCategory tab — local state)
 *     → sub filter       (active subcategory chip — local state)
 *     → applyItemFilters (URL-driven chips: category / location / urgency)
 *     → substring search (ephemeral local state)
 *     → applyItemSort    (URL-driven sort key + direction)
 *     → [optional] groupByUrgency
 */
export function ItemsList({ items, categories, storageLocations }: Props) {
  const { state, patch } = useFilterState();
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<ItemCategoryType>("food");
  const [activeSub, setActiveSub] = useState<string | null>(null);

  // Snapshot `now` once per render so the filter pass and the grouping
  // pass can't disagree on a midnight-edge case.
  const now = useMemo(() => new Date(), []);

  function handleTabChange(tab: ItemCategoryType) {
    setActiveTab(tab);
    setActiveSub(null);
    setQuery("");
    // Reset URL category filter — selected slugs from the previous tab
    // would silently hide all items in the new tab.
    if (state.categories.length > 0) {
      patch({ categories: [] });
    }
  }

  const filtered = useMemo(() => {
    const byTab = items.filter((i) => i.itemCategory === activeTab);
    const bySub =
      activeSub === null
        ? byTab
        : byTab.filter((i) => i.category === activeSub);
    const base = applyItemFilters(bySub, state, now);
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((item) => {
      const name = (item.customName ?? item.productName).toLowerCase();
      const brand = (item.brand ?? "").toLowerCase();
      return name.includes(q) || brand.includes(q);
    });
  }, [items, activeTab, activeSub, state, now, query]);

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
  const showNoResults = sorted.length === 0 && (hasActiveFilters || hasQuery || activeSub !== null);

  // Only pass categories relevant to the active tab into FiltersSheet.
  const tabCategories = useMemo(
    () => categories.filter((c) => c.parentCategory === activeTab),
    [categories, activeTab],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Category tabs */}
      <div
        role="tablist"
        aria-label="Kategorie"
        className="flex gap-1 rounded-xl bg-surface-raised p-1"
      >
        {CATEGORY_TABS.map(({ key, label, shortLabel, emoji }) => {
          const count = items.filter((i) => i.itemCategory === key).length;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={activeTab === key}
              aria-label={label}
              type="button"
              onClick={() => handleTabChange(key)}
              className={cn(
                "flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 text-xs font-medium transition-colors",
                activeTab === key
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted hover:text-foreground",
              )}
            >
              <span aria-hidden className="shrink-0">{emoji}</span>
              <span className="truncate">{shortLabel}</span>
              {count > 0 && (
                <span
                  className={cn(
                    "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
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

      {/* Subcategory chip bar */}
      <SubcategoryChips
        categories={tabCategories}
        items={items.filter((i) => i.itemCategory === activeTab)}
        activeSub={activeSub}
        onSelect={setActiveSub}
      />

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
        <FiltersSheet categories={tabCategories} storageLocations={storageLocations} />
      </div>

      {showNoResults && (
        <p className="py-6 text-center text-sm text-muted">
          {hasQuery
            ? `Keine Treffer für "${query}".`
            : "Keine Artikel für diese Filter."}
        </p>
      )}

      {!showNoResults && sorted.length === 0 && !hasActiveFilters && !hasQuery && activeSub === null && (
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

type SubcategoryChipsProps = {
  categories: CategoryDisplay[];
  items: ListItem[];
  activeSub: string | null;
  onSelect: (slug: string | null) => void;
};

/**
 * Horizontal scrollable chip bar showing subcategories for the active top-level tab.
 * Only chips that have at least one item are shown (plus "Alle").
 * Hidden entirely when no items exist for any subcategory.
 */
function SubcategoryChips({ categories, items, activeSub, onSelect }: SubcategoryChipsProps) {
  const occupiedSlugs = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (item.category) set.add(item.category);
    }
    return set;
  }, [items]);

  const visibleCategories = categories.filter((c) => occupiedSlugs.has(c.slug));

  if (visibleCategories.length === 0) return null;

  return (
    <div
      className="-mx-4 flex gap-2 overflow-x-auto px-4 py-0.5 scrollbar-none"
      role="group"
      aria-label="Unterkategorie"
    >
      <SubChip
        label="Alle"
        active={activeSub === null}
        onClick={() => onSelect(null)}
      />
      {visibleCategories.map((cat) => (
        <SubChip
          key={cat.slug}
          label={`${cat.icon} ${cat.name}`}
          active={activeSub === cat.slug}
          onClick={() => onSelect(activeSub === cat.slug ? null : cat.slug)}
        />
      ))}
    </div>
  );
}

function SubChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 shrink-0 items-center rounded-full border px-3 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-fg"
          : "border-border bg-surface text-foreground hover:bg-surface-raised",
      )}
    >
      {label}
    </button>
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
