"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Plus, Search, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
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

const TYPE_OPTIONS: { key: EventType | "all"; label: string }[] = [
  { key: "all", label: "Alle" },
  { key: "added", label: "Hinzugefügt" },
  { key: "consumed", label: "Verbraucht" },
  { key: "discarded", label: "Entsorgt" },
];

export function HistoryView({
  events,
  categories,
  storageLocations,
}: {
  events: HistoryEvent[];
  categories: CategoryDisplay[];
  storageLocations: StorageLocationDisplay[];
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<EventType | "all">("all");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [locFilter, setLocFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (typeFilter !== "all" && e.type !== typeFilter) return false;
      if (catFilter !== "all" && e.category !== catFilter) return false;
      if (locFilter !== "all" && e.location !== locFilter) return false;
      if (q) {
        const name = (e.customName ?? e.productName).toLowerCase();
        if (!name.includes(q)) return false;
      }
      return true;
    });
  }, [events, query, typeFilter, catFilter, locFilter]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  const activeFilterCount =
    (typeFilter !== "all" ? 1 : 0) +
    (catFilter !== "all" ? 1 : 0) +
    (locFilter !== "all" ? 1 : 0);

  return (
    <div className="flex flex-col gap-3">
      {/* Search */}
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
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
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      {/* Event type chips */}
      <div className="flex flex-wrap gap-1.5">
        {TYPE_OPTIONS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTypeFilter(key)}
            aria-pressed={typeFilter === key}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
              typeFilter === key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground hover:bg-muted",
            )}
          >
            {key === "added" && <Plus className="size-3" aria-hidden />}
            {key === "consumed" && <CheckCircle2 className="size-3" aria-hidden />}
            {key === "discarded" && <Trash2 className="size-3" aria-hidden />}
            {label}
          </button>
        ))}
      </div>

      {/* Secondary filters: category + location */}
      <div className="flex gap-2">
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          aria-label="Kategorie filtern"
          className="h-8 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="all">Alle Kategorien</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
        <select
          value={locFilter}
          onChange={(e) => setLocFilter(e.target.value)}
          aria-label="Lagerort filtern"
          className="h-8 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="all">Alle Lagerorte</option>
          {storageLocations.map((l) => (
            <option key={l.slug} value={l.slug}>
              {l.icon} {l.name}
            </option>
          ))}
        </select>
        {(activeFilterCount > 0 || query) && (
          <button
            type="button"
            onClick={() => {
              setTypeFilter("all");
              setCatFilter("all");
              setLocFilter("all");
              setQuery("");
            }}
            className="shrink-0 rounded-lg border px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        )}
      </div>

      {/* Event list */}
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Keine Einträge für diese Filter.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map(({ label, events: bucket }) => (
            <section key={label} className="flex flex-col gap-2">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
    </div>
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
    <article className="flex items-start gap-3 rounded-lg border bg-card px-3 py-2.5">
      <div className={cn("mt-0.5 shrink-0", colorClass)}>
        <TypeIcon className="size-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-medium leading-tight">{displayName}</p>
          <p className="shrink-0 text-xs text-muted-foreground">
            {formatTime(event.happenedAt)}
          </p>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {location && <span>{location.icon} {location.name}</span>}
          {category && <span>{category.icon} {category.name}</span>}
          {event.quantity != null && (
            <span>{formatQuantity(event.quantity, event.unit)}</span>
          )}
        </div>
      </div>
      <span
        className={cn(
          "mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
          colorClass,
          event.type === "added" && "bg-primary/10",
          event.type === "consumed" && "bg-emerald-50 dark:bg-emerald-950/30",
          event.type === "discarded" && "bg-destructive/10",
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
    colorClass: "text-primary",
    label: "Hinzugefügt",
  },
  consumed: {
    icon: CheckCircle2,
    colorClass: "text-emerald-600 dark:text-emerald-500",
    label: "Verbraucht",
  },
  discarded: {
    icon: Trash2,
    colorClass: "text-destructive",
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
  // localKey is already "DD.MM.YYYY" in German locale — use as-is
  return localKey;
}
