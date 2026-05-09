import type { Metadata } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BarChart3 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/session";
import { getActiveHouseholdId } from "@/lib/households/active";
import { CATEGORIES, getCategory, type CategoryKey } from "@/lib/constants/categories";
import type { Database } from "@/lib/supabase/database.types";
import type { CategoryDisplay } from "@/lib/schemas/categories";
import type { StorageLocationDisplay } from "@/lib/schemas/storage-locations";
import { TimeframeToggle, type RangeKey, RANGE_DAYS } from "./timeframe-toggle";
import { ViewToggle, type ViewKey } from "./view-toggle";
import { HistoryView, type HistoryEvent } from "./history-view";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Historie" };

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; view?: string }>;
}) {
  const params = await searchParams;
  const range = parseRange(params.range);
  const view: ViewKey = params.view === "stats" ? "stats" : "history";

  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  if (!user) return <AuthPrompt />;

  const activeHouseholdId = await getActiveHouseholdId(supabase, user.id);
  if (!activeHouseholdId) {
    return (
      <PageShell>
        <ViewToggle current={view} range={range} />
        <EmptyForRange range={range} />
      </PageShell>
    );
  }

  const cutoffIso = rangeCutoff(range);

  if (view === "history") {
    const [events, categories, storageLocations] = await Promise.all([
      loadHistory(supabase, activeHouseholdId, cutoffIso),
      loadCategories(supabase, activeHouseholdId),
      loadStorageLocations(supabase, activeHouseholdId),
    ]);

    return (
      <PageShell>
        <ViewToggle current={view} range={range} />
        <TimeframeToggle current={range} view={view} />
        {events.length === 0 ? (
          <EmptyForRange range={range} />
        ) : (
          <HistoryView
            events={events}
            categories={categories}
            storageLocations={storageLocations}
          />
        )}
      </PageShell>
    );
  }

  // ── Stats view ──────────────────────────────────────────────────────────────
  const base = supabase
    .from("items")
    .select("consumed_at, discarded_at, custom_category, product:products ( category )")
    .eq("household_id", activeHouseholdId)
    .or("consumed_at.not.is.null,discarded_at.not.is.null");

  const query = cutoffIso
    ? base.or(`consumed_at.gte.${cutoffIso},discarded_at.gte.${cutoffIso}`)
    : base;

  const { data, error } = await query;
  if (error) return <ErrorState message={error.message} />;

  const rows = (data ?? []).map((r) => ({
    closed: closedKind(r.consumed_at, r.discarded_at, cutoffIso),
    category: (r.custom_category ?? r.product?.category ?? "other") as CategoryKey,
  }));
  const effective = rows.filter((r) => r.closed !== null);
  const totals = {
    consumed: effective.filter((r) => r.closed === "consumed").length,
    discarded: effective.filter((r) => r.closed === "discarded").length,
  };
  const closedTotal = totals.consumed + totals.discarded;
  const wasteRate = closedTotal === 0 ? 0 : totals.discarded / closedTotal;
  const byCategory = aggregateByCategory(effective);

  return (
    <PageShell>
      <ViewToggle current={view} range={range} />
      <TimeframeToggle current={range} view={view} />

      {closedTotal === 0 ? (
        <EmptyForRange range={range} />
      ) : (
        <div className="flex flex-col gap-5">
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
            <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted">
              Nach Kategorie
            </h2>
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface-raised text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Kategorie</th>
                    <th className="px-3 py-2 text-right font-medium">Verbraucht</th>
                    <th className="px-3 py-2 text-right font-medium">Entsorgt</th>
                  </tr>
                </thead>
                <tbody>
                  {byCategory.map(({ key, consumed, discarded }) => (
                    <tr key={key} className="border-t border-border">
                      <td className="px-3 py-2">{getCategory(key).label}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{consumed}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{discarded}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </PageShell>
  );
}

// ── Data loaders ─────────────────────────────────────────────────────────────

async function loadHistory(
  supabase: SupabaseClient<Database>,
  householdId: string,
  cutoffIso: string | null,
): Promise<HistoryEvent[]> {
  let q = supabase
    .from("inventory_events")
    .select("id, type, product_name, custom_name, category, location, quantity, unit, happened_at")
    .eq("household_id", householdId)
    .order("happened_at", { ascending: false })
    .limit(500);

  if (cutoffIso) q = q.gte("happened_at", cutoffIso);

  const { data } = await q;
  return (data ?? []).map((e) => ({
    id: e.id,
    type: e.type as HistoryEvent["type"],
    productName: e.product_name,
    customName: e.custom_name,
    category: e.category,
    location: e.location,
    quantity: e.quantity != null ? Number(e.quantity) : null,
    unit: e.unit,
    happenedAt: e.happened_at,
  }));
}

async function loadCategories(
  supabase: SupabaseClient<Database>,
  householdId: string,
): Promise<CategoryDisplay[]> {
  const { data } = await supabase
    .from("categories")
    .select("id, name, icon, color, sort_order, is_system, slug")
    .eq("household_id", householdId)
    .order("sort_order", { ascending: true });
  return (data ?? []).map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    icon: c.icon,
    color: c.color,
    sortOrder: c.sort_order,
    isSystem: c.is_system,
  }));
}

async function loadStorageLocations(
  supabase: SupabaseClient<Database>,
  householdId: string,
): Promise<StorageLocationDisplay[]> {
  const { data } = await supabase
    .from("storage_locations")
    .select("id, name, icon, slug, sort_order, is_system, temperature_hint")
    .eq("household_id", householdId)
    .order("sort_order", { ascending: true });
  return (data ?? []).map((l) => ({
    id: l.id,
    slug: l.slug,
    name: l.name,
    icon: l.icon,
    sortOrder: l.sort_order,
    isSystem: l.is_system,
    temperatureHint: l.temperature_hint as StorageLocationDisplay["temperatureHint"],
  }));
}

// ── Layout helpers ─────────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <header className="mb-4">
        <h1 className="font-serif text-[26px] font-medium tracking-tight">Historie</h1>
      </header>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

// ── Stats helpers ─────────────────────────────────────────────────────────

function parseRange(raw: string | undefined): RangeKey {
  if (raw === "90") return "90";
  if (raw === "all") return "all";
  return "30";
}

function rangeCutoff(range: RangeKey): string | null {
  if (range === "all") return null;
  const days = RANGE_DAYS[range];
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

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

type CategoryAggregate = { key: CategoryKey; consumed: number; discarded: number };

function aggregateByCategory(
  rows: { closed: "consumed" | "discarded" | null; category: CategoryKey }[],
): CategoryAggregate[] {
  const seed = new Map<CategoryKey, CategoryAggregate>();
  for (const { key } of CATEGORIES) seed.set(key, { key, consumed: 0, discarded: 0 });
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

// ── KPI card ────────────────────────────────────────────────────────────────

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
        tone === "positive" && "border-primary/30 bg-primary-subtle text-primary-text",
        tone === "negative" && "border-danger/30 bg-danger-subtle text-danger",
        tone === "neutral" && "border-warning/30 bg-warning-subtle text-warning",
      )}
    >
      <span className="text-xs font-medium text-muted">{label}</span>
      <span className="mt-1 font-mono text-[26px] font-medium tabular-nums">{value}</span>
    </div>
  );
}

// ── Empty / error states ─────────────────────────────────────────────────────

function AuthPrompt() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <p className="text-sm text-muted">
        Bitte melde dich an, um die Historie zu sehen.
      </p>
    </div>
  );
}

function EmptyForRange({ range }: { range: RangeKey }) {
  const label =
    range === "all" ? "insgesamt" : `in den letzten ${RANGE_DAYS[range]} Tagen`;
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <BarChart3 className="size-10 text-muted" aria-hidden />
      <p className="mt-3 text-sm text-muted">
        Noch keine Einträge {label}.
      </p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <div
        role="alert"
        className="rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger"
      >
        Konnte Daten nicht laden: {message}
      </div>
    </div>
  );
}
