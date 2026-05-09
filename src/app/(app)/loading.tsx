/**
 * Shared loading skeleton for every page under `(app)/` that doesn't
 * define its own `loading.tsx`.
 *
 * Why this file exists at all: without `loading.tsx`, the Next.js client
 * router cannot prefetch dynamic routes — it blocks navigation until the
 * server has fully rendered the destination. Adding any `loading.tsx`
 * (even a trivial one) flips the route to stream with a Suspense
 * fallback, and `<Link>` can now prefetch up to the first Suspense
 * boundary. That's the tab-switch perf win.
 *
 * Shape: header (title + meta row) plus four list rows. Matches the
 * `mx-auto max-w-md px-4 py-6` container that every `(app)/` page uses,
 * and the `<ItemRow>` layout (thumbnail + two-line text + right-aligned
 * meta) — close enough that the skeleton reads as "same shape, content
 * filling in" rather than "unrelated spinner".
 *
 * Nested `loading.tsx` files under specific segments (e.g. `add/`) take
 * precedence where a more specific skeleton is worth the extra lines.
 */
export default function AppLoading() {
  return (
    <div
      className="mx-auto w-full max-w-md animate-pulse px-4 py-6"
      aria-hidden
    >
      {/* Household-switcher pill slot */}
      <div className="mb-3 h-7 w-40 rounded-lg bg-surface-raised" />
      {/* Header: title + right-side meta */}
      <div className="mb-4 flex items-center justify-between">
        <div className="h-8 w-32 rounded bg-surface-raised" />
        <div className="flex items-center gap-3">
          <div className="h-4 w-16 rounded bg-surface-raised" />
          <div className="size-8 rounded bg-surface-raised" />
        </div>
      </div>
      {/* Row stack */}
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3"
          >
            <div className="size-14 shrink-0 rounded-lg bg-surface-raised" />
            <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
              <div className="h-4 w-3/4 rounded bg-surface-raised" />
              <div className="h-3 w-1/2 rounded bg-surface-raised" />
            </div>
            <div className="h-4 w-10 rounded bg-surface-raised" />
          </div>
        ))}
      </div>
    </div>
  );
}
