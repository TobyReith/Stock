"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  CheckCheck,
  Loader2,
  Minus,
  Package,
  Plus,
  ShoppingBasket,
  Trash2,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addShoppingItem,
  deleteShoppingItem,
  markAllShoppingItemsBought,
  toggleShoppingItemBought,
  updateShoppingItemQuantity,
} from "@/lib/actions/shopping";
import { ShoppingItemSheet } from "./shopping-item-sheet";
import { CATEGORIES } from "@/lib/constants/categories";
import type { CategoryDisplay } from "@/lib/schemas/categories";

/**
 * Client shell for the shopping list.
 *
 * Interaction model:
 *   - The server component hydrates us with two buckets (open / recent).
 *   - Every user action (add, toggle, delete) uses `useOptimistic` so
 *     the UI flips instantly; the server action reconciles in the
 *     background and we `router.refresh()` on success to pull the
 *     canonical state back.
 *   - Failures surface via `toast.error` and the optimistic state
 *     snaps back on the next refresh — keeps the happy path responsive
 *     without a full-blown reducer.
 */

export type ShoppingEntry = {
  id: string;
  customName: string | null;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  addedAt: string; // ISO
  boughtAt: string | null; // ISO or null
  productId: string | null;
  productName: string | null;
  brand: string | null;
  imageUrl: string | null;
  category: string | null;
  itemCategory: string;
};

type Props = {
  open: ShoppingEntry[];
  recent: ShoppingEntry[];
  categories: CategoryDisplay[];
};

/**
 * Merge the server-provided buckets for optimistic reducer purposes.
 * The reducer itself operates on the flat list and partitions per render.
 */
type OptimisticAction =
  | { kind: "add"; entry: ShoppingEntry }
  | { kind: "toggle"; id: string; boughtAt: string | null }
  | { kind: "remove"; id: string }
  | { kind: "updateQty"; id: string; quantity: number | null }
  | { kind: "update"; id: string; patch: Partial<ShoppingEntry> };

export function ShoppingList({ open, recent, categories }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sheetEntry, setSheetEntry] = useState<ShoppingEntry | null>(null);
  const all = [...open, ...recent];

  const [entries, applyOptimistic] = useOptimistic(
    all,
    (state: ShoppingEntry[], action: OptimisticAction) => {
      switch (action.kind) {
        case "add":
          return [action.entry, ...state];
        case "toggle":
          return state.map((e) =>
            e.id === action.id ? { ...e, boughtAt: action.boughtAt } : e,
          );
        case "remove":
          return state.filter((e) => e.id !== action.id);
        case "updateQty":
          return state.map((e) =>
            e.id === action.id ? { ...e, quantity: action.quantity } : e,
          );
        case "update":
          return state.map((e) =>
            e.id === action.id ? { ...e, ...action.patch } : e,
          );
      }
    },
  );

  const openItems = entries.filter((e) => !e.boughtAt);
  const recentItems = entries
    .filter((e) => e.boughtAt)
    .sort((a, b) => (b.boughtAt ?? "").localeCompare(a.boughtAt ?? ""));

  // Build category groups in CATEGORIES order; null/unknown → "other"
  const grouped = new Map<string, ShoppingEntry[]>();
  for (const cat of CATEGORIES) grouped.set(cat.key, []);
  for (const item of openItems) {
    const key =
      item.category && grouped.has(item.category) ? item.category : "other";
    grouped.get(key)!.push(item);
  }

  function handleMarkAll() {
    const now = new Date().toISOString();
    startTransition(async () => {
      for (const item of openItems) {
        applyOptimistic({ kind: "toggle", id: item.id, boughtAt: now });
      }
      const res = await markAllShoppingItemsBought();
      if (!res.ok) {
        toast.error(res.error);
        router.refresh();
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <AddForm
        onOptimisticAdd={(entry) => applyOptimistic({ kind: "add", entry })}
        onRefresh={() => router.refresh()}
      />
      <ShoppingItemSheet
        entry={sheetEntry}
        categories={categories}
        onClose={() => setSheetEntry(null)}
        onOptimisticUpdate={(id, patch) =>
          applyOptimistic({ kind: "update", id, patch })
        }
        onOptimisticRemove={(id) => applyOptimistic({ kind: "remove", id })}
        onRefresh={() => router.refresh()}
      />

      {openItems.length === 0 && recentItems.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Open items section — grouped by category */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Noch zu kaufen
              </p>
              {openItems.length > 1 && (
                <button
                  type="button"
                  onClick={handleMarkAll}
                  disabled={pending}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <CheckCheck className="size-3.5" aria-hidden />
                  Alle abhaken
                </button>
              )}
            </div>

            {openItems.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted">
                Nichts offen.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {CATEGORIES.map((cat) => {
                  const items = grouped.get(cat.key) ?? [];
                  if (items.length === 0) return null;
                  return (
                    <div key={cat.key} className="flex flex-col gap-2">
                      <p className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {cat.label}
                      </p>
                      <ul className="flex flex-col gap-2">
                        {items.map((e) => (
                          <Row
                            key={e.id}
                            entry={e}
                            onOptimisticToggle={(id, boughtAt) =>
                              applyOptimistic({ kind: "toggle", id, boughtAt })
                            }
                            onOptimisticRemove={(id) =>
                              applyOptimistic({ kind: "remove", id })
                            }
                            onOptimisticUpdateQty={(id, quantity) =>
                              applyOptimistic({ kind: "updateQty", id, quantity })
                            }
                            onOpenDetail={() => setSheetEntry(e)}
                            onRefresh={() => router.refresh()}
                          />
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {recentItems.length > 0 && (
            <Section title="Zuletzt gekauft">
              {recentItems.map((e) => (
                <Row
                  key={e.id}
                  entry={e}
                  onOptimisticToggle={(id, boughtAt) =>
                    applyOptimistic({ kind: "toggle", id, boughtAt })
                  }
                  onOptimisticRemove={(id) =>
                    applyOptimistic({ kind: "remove", id })
                  }
                  onOpenDetail={() => setSheetEntry(e)}
                  onRefresh={() => router.refresh()}
                />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({
  title,
  empty = false,
  children,
}: {
  title: string;
  empty?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted">
        {title}
      </h2>
      {empty ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted">
          Nichts offen.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">{children}</ul>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <ShoppingBasket className="size-10 text-muted" aria-hidden />
      <h2 className="mt-3 text-base font-medium">Liste ist leer</h2>
      <p className="mt-1 max-w-xs text-sm text-muted">
        Tippe oben, was du brauchst — oder setz etwas aus dem Vorrat auf
        die Liste, sobald es leer wird.
      </p>
    </div>
  );
}

function AddForm({
  onOptimisticAdd,
  onRefresh,
}: {
  onOptimisticAdd: (entry: ShoppingEntry) => void;
  onRefresh: () => void;
}) {
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;

    // Optimistic row with a synthetic id — real id replaces it on
    // refresh. `crypto.randomUUID` is available in all evergreen
    // browsers and edge runtimes; no polyfill needed.
    const tempId = crypto.randomUUID();
    const now = new Date().toISOString();
    const entry: ShoppingEntry = {
      id: tempId,
      customName: trimmed,
      quantity: null,
      unit: null,
      note: null,
      addedAt: now,
      boughtAt: null,
      productId: null,
      productName: null,
      brand: null,
      imageUrl: null,
      category: null,
      itemCategory: "food",
    };

    startTransition(async () => {
      onOptimisticAdd(entry);
      setValue("");
      inputRef.current?.focus();

      const res = await addShoppingItem({ customName: trimmed });
      if (!res.ok) {
        toast.error(res.error);
      }
      onRefresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        ref={inputRef}
        type="text"
        inputMode="text"
        placeholder="Neu hinzufügen…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Einkaufsliste – neuer Eintrag"
        autoComplete="off"
        disabled={pending}
      />
      <Button type="submit" size="icon-sm" disabled={!value.trim() || pending}>
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <Plus aria-hidden />
        )}
        <span className="sr-only">Hinzufügen</span>
      </Button>
    </form>
  );
}

type RowProps = {
  entry: ShoppingEntry;
  onOptimisticToggle: (id: string, boughtAt: string | null) => void;
  onOptimisticRemove: (id: string) => void;
  onOptimisticUpdateQty?: (id: string, quantity: number | null) => void;
  onOpenDetail: () => void;
  onRefresh: () => void;
};

function Row({
  entry,
  onOptimisticToggle,
  onOptimisticRemove,
  onOptimisticUpdateQty,
  onOpenDetail,
  onRefresh,
}: RowProps) {
  const [pending, startTransition] = useTransition();
  const isBought = Boolean(entry.boughtAt);
  const name = entry.customName ?? entry.productName ?? "Unbenannt";

  function handleToggle() {
    const nextBoughtAt = isBought ? null : new Date().toISOString();
    startTransition(async () => {
      onOptimisticToggle(entry.id, nextBoughtAt);
      const res = await toggleShoppingItemBought(entry.id);
      if (!res.ok) {
        toast.error(res.error);
      }
      onRefresh();
    });
  }

  function handleDelete() {
    startTransition(async () => {
      onOptimisticRemove(entry.id);
      const res = await deleteShoppingItem(entry.id);
      if (!res.ok) {
        toast.error(res.error);
      }
      onRefresh();
    });
  }

  function handleDecrement() {
    const nextQty = entry.quantity === 1 ? null : (entry.quantity ?? 1) - 1;
    startTransition(async () => {
      onOptimisticUpdateQty?.(entry.id, nextQty);
      const res = await updateShoppingItemQuantity(entry.id, nextQty);
      if (!res.ok) toast.error(res.error);
      onRefresh();
    });
  }

  function handleIncrement() {
    const nextQty = (entry.quantity ?? 0) + 1;
    startTransition(async () => {
      onOptimisticUpdateQty?.(entry.id, nextQty);
      const res = await updateShoppingItemQuantity(entry.id, nextQty);
      if (!res.ok) toast.error(res.error);
      onRefresh();
    });
  }

  // For bought items only — quantity shown inline in the name area
  const qtyLabel =
    isBought && entry.quantity != null
      ? `${entry.quantity}${entry.unit ? ` ${entry.unit}` : ""}`
      : null;

  return (
    <li
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border px-3 py-2 transition-opacity",
        isBought ? "bg-surface-raised" : "bg-surface",
      )}
    >
      <button
        type="button"
        onClick={handleToggle}
        disabled={pending}
        role="checkbox"
        aria-checked={isBought}
        aria-label={isBought ? "Nicht gekauft markieren" : "Gekauft markieren"}
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded border transition-colors",
          isBought
            ? "border-primary bg-primary text-primary-fg"
            : "border-border hover:border-primary",
        )}
      >
        {isBought && (
          <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
            <path
              d="M3 8.5 L6.5 12 L13 4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      <button
        type="button"
        onClick={onOpenDetail}
        className="min-w-0 flex-1 text-left"
      >
        <p
          className={cn(
            "truncate text-sm",
            isBought ? "text-muted line-through" : "font-medium",
          )}
        >
          {name}
          {qtyLabel && (
            <span className="ml-2 font-mono text-xs font-normal text-muted">
              {qtyLabel}
            </span>
          )}
        </p>
        {entry.brand && (
          <p className="truncate text-xs text-muted-foreground">
            {entry.brand}
          </p>
        )}
      </button>

      {/* Right-hand actions. Order depends on state:
          - open   → Quantity editor (− n +), Löschen
          - bought → "In den Vorrat" (primary), Undo */}
      {isBought ? (
        <Link
          href={`/add?fromShopping=${entry.id}`}
          className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-medium text-primary-fg hover:bg-sage-400"
        >
          <Package className="size-3.5" aria-hidden /> In den Vorrat
        </Link>
      ) : (
        <div className="flex items-center">
          {entry.quantity === null ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={handleIncrement}
              disabled={pending}
              aria-label="Menge hinzufügen"
            >
              <Plus className="size-3.5" aria-hidden />
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={handleDecrement}
                disabled={pending}
                aria-label="Menge verringern"
              >
                <Minus className="size-3.5" aria-hidden />
              </Button>
              <span className="w-5 text-center text-sm tabular-nums">
                {entry.quantity}
              </span>
              {entry.unit && (
                <span className="text-xs text-muted-foreground">
                  {entry.unit}
                </span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={handleIncrement}
                disabled={pending}
                aria-label="Menge erhöhen"
              >
                <Plus className="size-3.5" aria-hidden />
              </Button>
            </>
          )}
        </div>
      )}

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={
          isBought
            ? () =>
                startTransition(() => {
                  onOptimisticToggle(entry.id, null);
                  void (async () => {
                    const res = await toggleShoppingItemBought(entry.id);
                    if (!res.ok) toast.error(res.error);
                    onRefresh();
                  })();
                })
            : handleDelete
        }
        disabled={pending}
        aria-label={
          isBought ? "Wieder als offen markieren" : "Eintrag löschen"
        }
        className="text-muted hover:text-foreground"
      >
        {isBought ? (
          <Undo2 className="size-4" aria-hidden />
        ) : (
          <Trash2 className="size-4" aria-hidden />
        )}
      </Button>
    </li>
  );
}
