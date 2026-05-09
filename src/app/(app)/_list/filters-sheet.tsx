"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ListFilter, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { CategoryDisplay } from "@/lib/schemas/categories";
import type { StorageLocationDisplay } from "@/lib/schemas/storage-locations";
import {
  EMPTY_FILTER_STATE,
  SORT_LABELS,
  URGENCY_LABELS,
  activeFilterCount,
  isDefaultFilterState,
  type SortDir,
  type SortKey,
  type UrgencyKey,
} from "@/lib/schemas/filters";
import { useFilterState } from "@/lib/hooks/use-filter-state";

/**
 * Filter + sort Sheet. Drives the state through {@link useFilterState}
 * which round-trips to the URL, so a fresh tab / shared link sees the
 * exact same view.
 *
 * Interaction model: **every tap commits immediately**. A bottom sheet
 * hides the list behind it, so a draft-and-apply pattern wouldn't offer
 * the visual preview it's usually sold on — simpler to write and to
 * reason about if the URL always matches what the user just tapped. The
 * badge on the trigger button gives instant feedback while the sheet is
 * still open.
 */

const URGENCIES: readonly UrgencyKey[] = ["expired", "soon", "later"];

const SORTS: readonly SortKey[] = ["mhd", "updated", "name", "brand"];

export function FiltersSheet({
  categories,
  storageLocations,
}: {
  categories: CategoryDisplay[];
  storageLocations: StorageLocationDisplay[];
}) {
  const { state, setState, patch } = useFilterState();
  const [open, setOpen] = useState(false);

  const activeCount = activeFilterCount(state);
  const canReset = !isDefaultFilterState(state);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="outline"
            size="default"
            aria-label={
              activeCount > 0
                ? `Filter (${activeCount} aktiv)`
                : "Filter"
            }
          >
            <ListFilter aria-hidden />
            Filter
            {activeCount > 0 ? (
              <span className="ml-1 inline-flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-fg tabular-nums">
                {activeCount}
              </span>
            ) : null}
          </Button>
        }
      />
      <SheetContent
        side="bottom"
        className="max-h-[85dvh] overflow-y-auto rounded-t-xl px-0 pb-6"
      >
        <SheetHeader className="px-4 pb-0">
          <SheetTitle>Filter & Sortierung</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-4 pt-2">
          <FilterAxis label="Kategorie">
            <ChipGroup
              options={categories.map((c) => ({ value: c.slug, label: `${c.icon} ${c.name}` }))}
              selected={state.categories}
              onToggle={(value) =>
                patch({ categories: toggleValue(state.categories, value) })
              }
            />
          </FilterAxis>

          <FilterAxis label="Lagerort">
            <ChipGroup
              options={storageLocations.map((l) => ({
                value: l.slug,
                label: `${l.icon} ${l.name}`,
              }))}
              selected={state.locations}
              onToggle={(value) =>
                patch({ locations: toggleValue(state.locations, value) })
              }
            />
          </FilterAxis>

          <FilterAxis label="Zustand">
            <ChipGroup
              options={URGENCIES.map((u) => ({
                value: u,
                label: URGENCY_LABELS[u],
              }))}
              selected={state.urgencies}
              onToggle={(value) =>
                patch({ urgencies: toggleValue(state.urgencies, value) })
              }
            />
          </FilterAxis>

          <FilterAxis label="Sortieren nach">
            <div className="flex flex-wrap items-center gap-2">
              {SORTS.map((key) => (
                <Chip
                  key={key}
                  label={SORT_LABELS[key]}
                  active={state.sort === key}
                  onClick={() => patch({ sort: key })}
                />
              ))}
              <DirectionToggle
                dir={state.dir}
                onToggle={() =>
                  patch({ dir: state.dir === "asc" ? "desc" : "asc" })
                }
              />
            </div>
          </FilterAxis>
        </div>

        <div className="mt-5 flex items-center justify-between gap-2 border-t border-border px-4 pt-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!canReset}
            onClick={() => setState(EMPTY_FILTER_STATE)}
          >
            <RotateCcw aria-hidden />
            Zurücksetzen
          </Button>
          <SheetClose
            render={
              <Button type="button" size="sm">
                Fertig
              </Button>
            }
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

type FilterAxisProps = {
  label: string;
  children: React.ReactNode;
};

function FilterAxis({ label, children }: FilterAxisProps) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted">
        {label}
      </h3>
      {children}
    </section>
  );
}

type ChipOption<T extends string> = { value: T; label: string };

type ChipGroupProps<T extends string> = {
  options: readonly ChipOption<T>[];
  selected: readonly T[];
  onToggle: (value: T) => void;
};

function ChipGroup<T extends string>({
  options,
  selected,
  onToggle,
}: ChipGroupProps<T>) {
  const sel = new Set(selected);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <Chip
          key={opt.value}
          label={opt.label}
          active={sel.has(opt.value)}
          onClick={() => onToggle(opt.value)}
        />
      ))}
    </div>
  );
}

type ChipProps = {
  label: string;
  active: boolean;
  onClick: () => void;
};

function Chip({ label, active, onClick }: ChipProps) {
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

type DirectionToggleProps = {
  dir: SortDir;
  onToggle: () => void;
};

/**
 * One button that shows the currently-active direction as its icon and
 * flips on tap. Labelled "Aufsteigend" / "Absteigend" for assistive tech.
 */
function DirectionToggle({ dir, onToggle }: DirectionToggleProps) {
  const ascending = dir === "asc";
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      onClick={onToggle}
      aria-label={ascending ? "Aufsteigend" : "Absteigend"}
      title={ascending ? "Aufsteigend" : "Absteigend"}
    >
      {ascending ? <ArrowUp aria-hidden /> : <ArrowDown aria-hidden />}
    </Button>
  );
}

function toggleValue<T extends string>(current: readonly T[], value: T): T[] {
  return current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
}

