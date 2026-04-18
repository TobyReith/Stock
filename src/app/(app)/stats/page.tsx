import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveHouseholdId } from "@/lib/households/active";
import { CATEGORIES, getCategory, type CategoryKey } from "@/lib/constants/categories";
import { TimeframeToggle, type RangeKey, RANGE_DAYS } from "./timeframe-toggle";
import { ActiveHouseholdBadge } from "../_header/active-household-badge";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Statistik" };

/**
 * Phase 1 stats page.
 *
 * Three KPI cards + a per-category breakdown. Timeframe is toggled via
 * a URL query param (`?range=30|90|all`) so the page stays a pure
 * server component — no client state, no useSWR, no shimmering
 * dashboards. Picks the param in the server fetch, done.
 *
 * The "closed" items population (rows with consumed_at OR discarded_at)
 * is small per household (dozens to a few hundred over time), so we
 * fetch the whole set inside the selected window and do the grouping
 * in memory. Much simpler than juggling SQL aggregates and future-proof
 * enough for a household-scale app.
 */
export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const params = await searchParams;
  const range = parseRange(params.range);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <EmptyState />;

  // Stats are per-active-household. A user with memberships in several
  // households sees the stats for whichever one the switcher has
  // selected — merging across households here would conflate "my
  // family's waste" with "my shared flat's waste", which isn't useful.
  const activeHouseholdId = await getActiveHouseholdId(supabase, user.id);
  if (!activeHouseholdId) return <EmptyForRange range={range} />;

  // Cutoff ISO timestamp for the selected range, or null for "all time".
  const cutoffIso = rangeCutoff(range);

  // Pull all closed items (consumed OR discarded) with the category from
  // the joined product row, scoped to the active household.
  // `.or(...)` on the same column list is awkward in PostgREST — we just
  // fetch the closed rows with one `not.is.null` each and merge.
  const base = supabase
    .from("items")
    .select("consumed_at, discarded_at, product:products ( category )")
    .eq("household_id", activeHouseholdId)
    .or(`consumed_at.not.is.null,discarded_at.not.is.null`);

  const query = cutoffIso
    ? base.or(`consumed_at.gte.${cutoffIso},discarded_at.gte.${cutoffIso}`)
    : base;

  const { data, error } = await query;
  if (error) return <ErrorState message={error.message} />;

  const rows = (data ?? []).map((r) => ({
    closed: closedKind(r.consumed_at, r.discarded_at, cutoffIso),
    category: (r.product?.category ?? "other") as CategoryKey,
  }));

  // Only keep rows that actually closed inside the window. `.or` with a
  // timestamp gte is a *row-level* filter — a row can satisfy the outer
  // "not null" check via consumed_at while its discarded_at (or vice
  // versa) falls outside the window. We recomputed the effective closing
  // event in `closedKind`, which returns null when neither side lands in
  // the window. Drop those.
  const effective = rows.filter((r) => r.closed !== null);

  const totals = {
    consumed: effective.filter((r) => r.closed === "consumed").length,
    discarded: effective.filter((r) => r.closed === "discarded").length,
  };
  const closedTotal = totals.consumed + totals.discarded;
  const wasteRate = closedTotal === 0 ? 0 : totals.discarded / closedTotal;

  const byCategory = aggregateByCategory(effective);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <div className="mb-3">
        <ActiveHouseholdBadge />
      </div>
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Statistik</h1>
      </header>
      <TimeframeToggle current={range} />

      {closedTotal === 0 ? (
        <EmptyForRange range={range} />
      ) : (
        <div className="mt-5 flex flex-col gap-5">
          <section className="grid grid-cols-3 gap-2">
            <Kpi label="Verbraucht" value={totals.consumed} tone="positive" />
            <Kpi label="Entsorgt" value={totals.discarded} tone="negative" />
            <Kpi
              label="Verschwendung"
              value={`${Math.round(wasteRate * 100)}%`}
              tone={wasteRate <= 0.15 ? "positive" : wasteRate <= 0.3 ? "neutral" : "negative"}
            />
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Nach Kategorie
            </h2>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Kategorie</th>
                    <th className="px-3 py-2 text-right font-medium">Verbraucht</th>
                    <th className="px-3 py-2 text-right font-medium">Entsorgt</th>
                  </tr>
                </thead>
                <tbody>
                  {byCategory.map(({ key, consumed, discarded }) => (
                    <tr key={key} className="border-t">
                      <td className="px-3 py-2">{getCategory(key).label}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{consumed}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {discarded}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

/* ---------- KPI card --------------------------------------------------- */

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "positive" | "negative" | "neutral";
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start rounded-lg border p-3",
        tone === "positive" && "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30",
        tone === "negative" && "border-destructive/30 bg-destructive/10",
        tone === "neutral" && "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30",
      )}
    >
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="mt-1 text-2xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}

/* ---------- Helpers: range + aggregation ------------------------------- */

function parseRange(raw: string | undefined): RangeKey {
  if (raw === "90") return "90";
  if (raw === "all") return "all";
  return "30"; // default
}

/**
 * ISO timestamp floor for the selected range, or null for all-time.
 * Uses now - N days at the time of the request — good enough; we're
 * not a financial ledger.
 */
function rangeCutoff(range: RangeKey): string | null {
  if (range === "all") return null;
  const days = RANGE_DAYS[range];
  const d = new Date(Date.now() - days * 86_400_000);
  return d.toISOString();
}

/**
 * Return which event effectively closed this row inside the window.
 *
 * Returns `null` when the closing event we'd attribute to (whichever
 * timestamp is set) happens to sit *before* the window cutoff. That
 * filters out rows that slipped through the PostgREST `.or` because the
 * *other* (null) timestamp couldn't help the filter.
 */
function closedKind(
  consumedAt: string | null,
  discardedAt: string | null,
  cutoffIso: string | null,
): "consumed" | "discarded" | null {
  if (consumedAt) {
    if (!cutoffIso || consumedAt >= cutoffIso) return "consumed";
    return null;
  }
  if (discardedAt) {
    if (!cutoffIso || discardedAt >= cutoffIso) return "discarded";
    return null;
  }
  return null;
}

type CategoryAggregate = {
  key: CategoryKey;
  consumed: number;
  discarded: number;
};

/**
 * Aggregate closed rows by category key, sorted by total desc.
 *
 * Categories with zero activity are omitted — the table shouldn't list
 * twelve rows of zeroes when the user has only cooked through yoghurt
 * and bread.
 */
function aggregateByCategory(
  rows: { closed: "consumed" | "discarded" | null; category: CategoryKey }[],
): CategoryAggregate[] {
  const seed = new Map<CategoryKey, CategoryAggregate>();
  for (const { key } of CATEGORIES) {
    seed.set(key, { key, consumed: 0, discarded: 0 });
  }
  for (const r of rows) {
    if (!r.closed) continue;
    const agg = seed.get(r.category) ?? seed.get("other")!;
    if (r.closed === "consumed") agg.consumed += 1;
    else agg.discarded += 1;
  }
  return [...seed.values()]
    .filter((a) => a.consumed + a.discarded > 0)
    .sort((a, b) => b.consumed + b.discarded - (a.consumed + a.discarded));
}

/* ---------- Empty / error states --------------------------------------- */

function EmptyState() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <p className="text-sm text-muted-foreground">
        Bitte melde dich an, um deine Statistik zu sehen.
      </p>
    </div>
  );
}

function EmptyForRange({ range }: { range: RangeKey }) {
  const label =
    range === "all" ? "insgesamt" : `in den letzten ${RANGE_DAYS[range]} Tagen`;
  return (
    <div className="mt-5 flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center">
      <BarChart3 className="size-10 text-muted-foreground" aria-hidden />
      <p className="mt-3 text-sm text-muted-foreground">
        Noch keine abgeschlossenen Artikel {label}.
      </p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Statistik</h1>
      <div
        role="alert"
        className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      >
        Konnte Statistik nicht laden: {message}
      </div>
    </div>
  );
}
