"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  filterStateToSearchParams,
  parseFilterStateFromSearchParams,
  type FilterState,
} from "@/lib/schemas/filters";

/**
 * Two-way bridge between the items-list filter UI and the URL.
 *
 * Reads: `useSearchParams()` is the source of truth. Any component
 * calling this hook re-renders when the query string changes, so
 * browser back/forward and shared links Just Work.
 *
 * Writes: `setState` (and the partial `patch` helper) serialise the
 * next state to a fresh query string via `filterStateToSearchParams`
 * and hand it to `router.replace(..., { scroll: false })`.
 *
 *   - `replace` (not `push`): the filter isn't a navigation event,
 *     cluttering the history stack with "back through every toggle"
 *     would be annoying.
 *   - `{ scroll: false }`: keeps the user's scroll position on the
 *     list after a chip toggle.
 *
 * This is the first URL-state pattern in the app; follow the same
 * shape for future list filters.
 */
export function useFilterState(): {
  state: FilterState;
  setState: (next: FilterState) => void;
  patch: (partial: Partial<FilterState>) => void;
} {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const state = useMemo<FilterState>(
    () => parseFilterStateFromSearchParams(searchParams),
    [searchParams],
  );

  const setState = useCallback(
    (next: FilterState) => {
      const qs = filterStateToSearchParams(next).toString();
      const href = qs ? `${pathname}?${qs}` : pathname;
      router.replace(href, { scroll: false });
    },
    [pathname, router],
  );

  const patch = useCallback(
    (partial: Partial<FilterState>) => {
      setState({ ...state, ...partial });
    },
    [setState, state],
  );

  return { state, setState, patch };
}
