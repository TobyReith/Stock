import type { ListItem } from "@/app/(app)/_list/items-list";
import { mhdUrgency } from "@/lib/date";
import type { FilterState, SortKey, SortDir } from "@/lib/schemas/filters";

/**
 * Pure filter + sort logic for the items list.
 *
 * Split out of the component so it's trivial to reason about (and unit-
 * test, if/when we add tests) without React state in the mix. Everything
 * here is deterministic given `(items, state, now)` — no date drift, no
 * hidden globals.
 */

/**
 * Apply an AND-across-axes, OR-within-axis filter. An empty array on an
 * axis means "match anything on this axis".
 *
 * `now` is injectable so the filter result is reproducible — callers
 * that want to group by urgency *after* filtering share the same
 * instant and the two passes can't disagree on a midnight-edge case.
 */
export function applyItemFilters(
  items: ListItem[],
  state: FilterState,
  now: Date = new Date(),
): ListItem[] {
  // Widened to `Set<string>` so we can feed raw DB values (typed as
  // plain `string` on `ListItem`) into `.has()` without a cast dance.
  // The set's contents are still validated enum members.
  const catSet = new Set<string>(state.categories);
  const locSet = new Set<string>(state.locations);
  const mhdSet = new Set<string>(state.urgencies);

  return items.filter((item) => {
    if (catSet.size > 0) {
      // `category` can be null when the joined product has none *and*
      // no override. Treat that as "no category" — a user filtering
      // for something specific doesn't want unlabelled rows sneaking in.
      if (!item.category || !catSet.has(item.category)) return false;
    }
    if (locSet.size > 0 && !locSet.has(item.location)) return false;
    if (mhdSet.size > 0) {
      const u = mhdUrgency(item.bestBefore, now);
      if (!mhdSet.has(u)) return false;
    }
    return true;
  });
}

/**
 * Apply a single sort pass. The returned array is a copy — the caller's
 * input is left intact so React's referential-equality checks downstream
 * stay sane.
 *
 * Tie-breakers: for everything except MHD we fall back to `bestBefore`
 * ascending. Without a tie-breaker identical names cluster in insertion
 * order, which feels arbitrary; falling back to MHD gives "alphabetical,
 * earliest-expiry first within the same name" — a reasonable secondary
 * ranking for a pantry app.
 */
export function applyItemSort(
  items: ListItem[],
  sort: SortKey,
  dir: SortDir,
): ListItem[] {
  const mult = dir === "asc" ? 1 : -1;
  const copy = items.slice();
  copy.sort((a, b) => {
    const primary = primaryCompare(a, b, sort);
    if (primary !== 0) return primary * mult;
    // Tie-breaker: MHD ascending, independent of the user's direction
    // choice — within a tie we always want the more urgent item first.
    return a.bestBefore.localeCompare(b.bestBefore);
  });
  return copy;
}

function primaryCompare(a: ListItem, b: ListItem, sort: SortKey): number {
  switch (sort) {
    case "mhd":
      // ISO date strings compare lexicographically in chronological order.
      return a.bestBefore.localeCompare(b.bestBefore);
    case "updated":
      // ISO timestamps with TZ also compare correctly as strings.
      return a.updatedAt.localeCompare(b.updatedAt);
    case "name":
      return displayName(a).localeCompare(displayName(b), "de", {
        sensitivity: "base",
      });
    case "brand":
      return brandSortKey(a).localeCompare(brandSortKey(b), "de", {
        sensitivity: "base",
      });
  }
}

function displayName(item: ListItem): string {
  return item.customName ?? item.productName;
}

/**
 * Items without a brand drop to the end regardless of sort direction —
 * the user asked for "by brand", empty brands being mixed into the
 * middle of the alphabet would just be noise. `~` sorts after all
 * printable letters in both localeCompare and raw string compare.
 */
function brandSortKey(item: ListItem): string {
  const brand = item.brand?.trim();
  return brand && brand.length > 0 ? brand : "~";
}
