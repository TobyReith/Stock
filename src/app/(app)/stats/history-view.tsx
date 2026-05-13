"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Plus, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { CategoryDisplay } from "@/lib/schemas/categories";
import type { StorageLocationDisplay } from "@/lib/schemas/storage-locations";

export type HistoryEvent = {
  id: string;
  type: "added" | "consumed" | "discarded";
  productName: string;
  customName: string | null;
  category: string | null;
  location: string | null;
  quantity: number | null;
  unit: string | null;
  happenedAt: string;
};

type EventType = "added" | "consumed" | "discarded";
type ArtKey = "food" | "hygiene" | "medicine";

const ART_TABS: { key: ArtKey; emoji: string; label: string }[] = [
  { key: "food",     emoji: "🥦", label: "Essen" },
  { key: "hygiene",  emoji: "🧴", label: "Hygiene" },
  { key: "medicine", emoji: "💊", label: "Medizin" },
];

const TYPE_OPTIONS: { key: EventType | "all"; label: string }[] = [
  { key: "all",      label: "Alle" },
  { key: "added",    label: "Hinzugefügt" },
  { key: "consumed", label: "Verbraucht" },
  { key: "discarded", label: "Entsorgt" },
];

function getEventArt(event: HistoryEvent, categories: CategoryDisplay[]): ArtKey | null {
  if (!event.category) return null;
  const cat = categories.find((c) => c.slug === event.category);
  return (cat?.parentCategory as ArtKey | undefined) ?? null;
}

export function HistoryView({
  events,
  categories,
  storageLocations,
}: {
  events: HistoryEvent[];
  categories: CategoryDisplay[];
  storageLocations: StorageLocationDisplay[];
}) {
  const [artFilter, setArtFilter] = useState<ArtKey>("food");
  const [typeFilter, setTypeFilter] = useState<EventType | "all">("all");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [locFilter, setLocFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);

  const artCategories = useMemo(
    () => categories.filter((c) => c.parentCategory === artFilter),
    [categories, artFilter],
  );

  function handleArtChange(art: ArtKey) {
    setArtFilter(art);
    setCatFilter("all");
    setTypeFilter("all");
    setQuery("");
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      const eventArt = getEventArt(e, categories);
      if (eventArt !== null && eventArt !== artFilter) return false;
      if (typeFilter !== "all" && e.type !== typeFilter) return false;
      if (catFilter !== "all" && e.category !== catFilter) return false;
      if (locFilter !== "all" && e.location !== locFilter) return false;
      if (q) {
        const name = (e.customName ?? e.productName).toLowerCase();
        if (!name.includes(q)) return false;
      }
      return true;
    });
  }, [events, query, artFilter, typeFilter, catFilter, locFilter, categories]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  const artCounts = useMemo(() => {
    const counts: Record<ArtKey, number> = { food: 0, hygiene: 0, medicine: 0 };
    for (const e of events) {
      const art = getEventArt(e, categories);
      if (art) counts[art] += 1;
    }
    return counts;
  }, [events, categories]);

  const activeFilterCount =
    (typeFilter !== "all" ? 1 : 0) +
    (catFilter !== "all" ? 1 : 0) +
    (locFilter !== "all" ? 1 : 0);

  return (
    <div className="flex flex-col gap-3">
      {/* Art-Tabs */}
      <div
        role="tablist"
        aria-label="Art"
        className="flex gap-1 rounded-xl bg-surface-raised p-1"
      >
        {ART_TABS.map(({ key, emoji, label }) => {
          const count = artCounts[key];
          return (
            <button
              key={key}
              role="tab"
              aria-selected={artFilter === key}
              aria-label={label}
              type="button"
              onClick={() => handleArtChange(key)}
              className={cn(
                "flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 text-xs font-medium transition-colors",
                artFilter === key
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted hover:text-foreground",
              )}
            >
              <span aria-hidden className="shrink-0">{emoji}</span>
              <span className="truncate">{label}</span>
              {count > 0 && (
                <span
                  className={cn(
                    "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                    artFilter === key
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

      {/* Search + Filter button */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted"
          />
          <Input
            type="search"
            placeholder="Artikel suchen…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 pr-8"
            aria-label="Verlauf durchsuchen"
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
        <button
          type="button"
          onClick={() => setFilterOpen(true)}
          aria-label={`Filter${activeFilterCount > 0 ? ` (${activeFilterCount} aktiv)` : ""}`}
          className={cn(
            "relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors",
            activeFilterCount > 0
              ? "border-primary bg-primary text-primary-fg"
              : "border-border bg-surface text-foreground hover:bg-surface-raised",
          )}
        >
          <SlidersHorizontal className="size-3.5" aria-hidden />
          Filter
          {activeFilterCount > 0 && (
            <span className="ml-0.5 rounded-full bg-primary-fg/20 px-1.5 py-0.5 text-[10px] tabular-nums">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Event-Typ-Chips */}
      <div
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 scrollbar-none"
        role="group"
        aria-label="Ereignistyp"
      >
        {TYPE_OPTIONS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTypeFilter(key)}
            aria-pressed={typeFilter === key}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
              typeFilter === key
                ? "border-primary bg-primary text-primary-fg"
                : "border-border bg-surface text-foreground hover:bg-surface-raised",
            )}
          >
            {key === "added" && <Plus className="size-3" aria-hidden />}
            {key === "consumed" && <CheckCircle2 className="size-3" aria-hidden />}
            {key === "discarded" && <Trash2 className="size-3" aria-hidden />}
            {label}
          </button>
        ))}
      </div>

      {/* Event list */}
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          Keine Einträge für diese Filter.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map(({ label, events: bucket }) => (
            <section key={label} className="flex flex-col gap-2">
              <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                {label}
              </h2>
              <ul className="flex flex-col gap-2">
                {bucket.map((event) => (
                  <li key={event.id}>
                    <EventRow
                      event={event}
                      categories={categories}
                      storageLocations={storageLocations}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* Filter Sheet */}
      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent side="bottom" showCloseButton={false} className="rounded-t-2xl pb-[env(safe-area-inset-bottom)]">
          <SheetHeader className="pb-0">
            <SheetTitle>Filter</SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-2">
            {/* Kategorie */}
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                Kategorie
              </p>
              <div className="flex flex-wrap gap-1.5">
                <FilterChip
                  label="Alle"
                  active={catFilter === "all"}
                  onClick={() => setCatFilter("all")}
                />
                {artCategories.map((c) => (
                  <FilterChip
                    key={c.slug}
                    label={`${c.icon} ${c.name}`}
                    active={catFilter === c.slug}
                    onClick={() => setCatFilter(catFilter === c.slug ? "all" : c.slug)}
                  />
                ))}
              </div>
            </div>

            {/* Lagerort */}
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                Lagerort
              </p>
              <div className="flex flex-wrap gap-1.5">
                <FilterChip
                  label="Alle"
                  active={locFilter === "all"}
                  onClick={() => setLocFilter("all")}
                />
                {storageLocations.map((l) => (
                  <FilterChip
                    key={l.slug}
                    label={`${l.icon} ${l.name}`}
                    active={locFilter === l.slug}
                    onClick={() => setLocFilter(locFilter === l.slug ? "all" : l.slug)}
                  />
                ))}
              </div>
            </div>
          </div>

          <SheetFooter className="flex-row gap-2 pt-0">
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setCatFilter("all");
                  setLocFilter("all");
                }}
                className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted hover:bg-surface-raised hover:text-foreground"
              >
                Zurücksetzen
              </button>
            )}
            <button
              type="button"
              onClick={() => setFilterOpen(false)}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-fg hover:bg-sage-400"
            >
              Fertig
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FilterChip({
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
        "inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-fg"
          : "border-border bg-surface text-foreground hover:bg-surface-raised",
      )}
    >
      {label}
    </button>
  );
}

function EventRow({
  event,
  categories,
  storageLocations,
}: {
  event: HistoryEvent;
  categories: CategoryDisplay[];
  storageLocations: StorageLocationDisplay[];
}) {
  const displayName = event.customName ?? event.productName;
  const category = categories.find((c) => c.slug === event.category);
  const location = storageLocations.find((l) => l.slug === event.location);

  const { icon: TypeIcon, colorClass, label: typeLabel } = EVENT_TYPE_META[event.type];

  return (
    <article className="flex items-start gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
      <div className={cn("mt-0.5 shrink-0", colorClass)}>
        <TypeIcon className="size-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-medium leading-tight">{displayName}</p>
          <p className="shrink-0 font-mono text-xs text-muted">
            {formatTime(event.happenedAt)}
          </p>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          {location && <span>{location.icon} {location.name}</span>}
          {category && <span>{category.icon} {category.name}</span>}
          {event.quantity != null && (
            <span className="font-mono">{formatQuantity(event.quantity, event.unit)}</span>
          )}
        </div>
      </div>
      <span
        className={cn(
          "mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
          event.type === "added" && "bg-primary-subtle text-primary-text",
          event.type === "consumed" && "bg-primary-subtle text-primary-text",
          event.type === "discarded" && "bg-danger-subtle text-danger",
        )}
      >
        {typeLabel}
      </span>
    </article>
  );
}

const EVENT_TYPE_META = {
  added: {
    icon: Plus,
    colorClass: "text-primary-text",
    label: "Hinzugefügt",
  },
  consumed: {
    icon: CheckCircle2,
    colorClass: "text-primary-text",
    label: "Verbraucht",
  },
  discarded: {
    icon: Trash2,
    colorClass: "text-danger",
    label: "Entsorgt",
  },
} as const;

function formatQuantity(qty: number, unit: string | null): string {
  const num = Number.isInteger(qty) ? String(qty) : qty.toFixed(1);
  return unit ? `${num} ${unit}` : num;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

type DateGroup = { label: string; events: HistoryEvent[] };

function groupByDate(events: HistoryEvent[]): DateGroup[] {
  const groups = new Map<string, HistoryEvent[]>();
  const now = new Date();
  const today = toLocalDateKey(now);
  const yesterday = toLocalDateKey(new Date(now.getTime() - 86_400_000));

  for (const event of events) {
    const key = toLocalDateKey(new Date(event.happenedAt));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(event);
  }

  return Array.from(groups.entries()).map(([key, bucket]) => ({
    label:
      key === today
        ? "Heute"
        : key === yesterday
          ? "Gestern"
          : formatDateLabel(key),
    events: bucket,
  }));
}

function toLocalDateKey(d: Date): string {
  return d.toLocaleDateString("de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatDateLabel(localKey: string): string {
  return localKey;
}
