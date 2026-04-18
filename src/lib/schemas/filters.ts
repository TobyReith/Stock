import { z } from "zod";
import { categoryKeySchema, locationSchema } from "@/lib/schemas/items";

/**
 * Filter + sort state for the main items list.
 *
 * Zod-schema-first because this state round-trips through the URL —
 * the same parser both reads `?cat=…&sort=…` into a validated object and
 * rejects hand-rolled junk gracefully (unknown enum values just drop
 * out of the array; a missing sort falls through to its default).
 *
 * Arrays are treated as OR within an axis and AND across axes:
 *   categories=[dairy,beverages] & locations=[fridge]
 *   → items whose category is dairy OR beverages, AND whose location is fridge.
 * An empty array means "no filter on this axis" (inclusive).
 */

export const urgencySchema = z.enum(["expired", "soon", "later"]);
export type UrgencyKey = z.infer<typeof urgencySchema>;

export const sortKeySchema = z.enum(["mhd", "updated", "name", "brand"]);
export type SortKey = z.infer<typeof sortKeySchema>;

export const sortDirSchema = z.enum(["asc", "desc"]);
export type SortDir = z.infer<typeof sortDirSchema>;

export const DEFAULT_SORT: SortKey = "mhd";
export const DEFAULT_DIR: SortDir = "asc";

/**
 * Labels driven by constants so the Sheet can render them directly
 * without the components importing from two different places.
 */
export const URGENCY_LABELS: Record<UrgencyKey, string> = {
  expired: "Abgelaufen",
  soon: "Läuft bald ab",
  later: "Lange haltbar",
};

export const SORT_LABELS: Record<SortKey, string> = {
  mhd: "Haltbarkeit",
  updated: "Änderungsdatum",
  name: "Name",
  brand: "Marke",
};

/**
 * Filter+sort state. All filter arrays are optional in the URL: an
 * empty / missing list means "match everything on this axis".
 */
export const filterStateSchema = z.object({
  categories: z.array(categoryKeySchema).default([]),
  locations: z.array(locationSchema).default([]),
  urgencies: z.array(urgencySchema).default([]),
  sort: sortKeySchema.default(DEFAULT_SORT),
  dir: sortDirSchema.default(DEFAULT_DIR),
});

export type FilterState = z.infer<typeof filterStateSchema>;

export const EMPTY_FILTER_STATE: FilterState = {
  categories: [],
  locations: [],
  urgencies: [],
  sort: DEFAULT_SORT,
  dir: DEFAULT_DIR,
};

/**
 * Parse a comma-separated URL param into a validated array. Silently
 * drops unknown enum members — we don't want a typo in a shared link
 * to blow up the whole filter UI; the user will see the chips they
 * actually got and can re-toggle the rest.
 */
function parseList<T extends string>(
  raw: string | null | undefined,
  schema: z.ZodType<T>,
): T[] {
  if (!raw) return [];
  const seen = new Set<T>();
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const parsed = schema.safeParse(trimmed);
    if (parsed.success) seen.add(parsed.data);
  }
  return Array.from(seen);
}

/**
 * Read a filter state out of a URLSearchParams-like interface. Accepts
 * both the real `URLSearchParams` and Next's `ReadonlyURLSearchParams`
 * from `useSearchParams` since both share the `.get()` contract.
 */
export function parseFilterStateFromSearchParams(
  params: Pick<URLSearchParams, "get">,
): FilterState {
  const sort = sortKeySchema.safeParse(params.get("sort") ?? DEFAULT_SORT);
  const dir = sortDirSchema.safeParse(params.get("dir") ?? DEFAULT_DIR);
  return {
    categories: parseList(params.get("cat"), categoryKeySchema),
    locations: parseList(params.get("loc"), locationSchema),
    urgencies: parseList(params.get("mhd"), urgencySchema),
    sort: sort.success ? sort.data : DEFAULT_SORT,
    dir: dir.success ? dir.data : DEFAULT_DIR,
  };
}

/**
 * Serialize a filter state back into URL params. Default values are
 * intentionally omitted so the URL stays clean for the common case
 * (fresh list = no query string at all).
 *
 * Returns a plain `URLSearchParams` the caller can splice into a
 * `router.replace` call.
 */
export function filterStateToSearchParams(
  state: FilterState,
): URLSearchParams {
  const out = new URLSearchParams();
  if (state.categories.length) out.set("cat", state.categories.join(","));
  if (state.locations.length) out.set("loc", state.locations.join(","));
  if (state.urgencies.length) out.set("mhd", state.urgencies.join(","));
  if (state.sort !== DEFAULT_SORT) out.set("sort", state.sort);
  if (state.dir !== DEFAULT_DIR) out.set("dir", state.dir);
  return out;
}

/**
 * How many filter chips are "active" — drives the badge count on the
 * trigger button. Sort doesn't count; a fresh state shows "0".
 */
export function activeFilterCount(state: FilterState): number {
  return (
    state.categories.length + state.locations.length + state.urgencies.length
  );
}

/**
 * Detect the "nothing to show" state — used to gate the "Zurücksetzen"
 * button and the fallback empty copy.
 */
export function isDefaultFilterState(state: FilterState): boolean {
  return (
    state.categories.length === 0 &&
    state.locations.length === 0 &&
    state.urgencies.length === 0 &&
    state.sort === DEFAULT_SORT &&
    state.dir === DEFAULT_DIR
  );
}
