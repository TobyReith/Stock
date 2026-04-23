"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Loader2,
  Package,
  Plus,
  Share2,
  ShoppingBasket,
  Trash2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addShoppingItem,
  deleteShoppingItem,
  toggleShoppingItemBought,
} from "@/lib/actions/shopping";

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
};

type Props = {
  open: ShoppingEntry[];
  recent: ShoppingEntry[];
};

/**
 * Merge the server-provided buckets for optimistic reducer purposes.
 * The reducer itself operates on the flat list and partitions per render.
 */
type OptimisticAction =
  | { kind: "add"; entry: ShoppingEntry }
  | { kind: "toggle"; id: string; boughtAt: string | null }
  | { kind: "remove"; id: string };

export function ShoppingList({ open, recent }: Props) {
  const router = useRouter();
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
      }
    },
  );

  const openItems = entries.filter((e) => !e.boughtAt);
  const recentItems = entries
    .filter((e) => e.boughtAt)
    .sort((a, b) => (b.boughtAt ?? "").localeCompare(a.boughtAt ?? ""));

  return (
    <div className="flex flex-col gap-5">
      <AddForm
        onOptimisticAdd={(entry) => applyOptimistic({ kind: "add", entry })}
        onRefresh={() => router.refresh()}
      />

      {openItems.length === 0 && recentItems.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <Section title="Noch zu kaufen" empty={openItems.length === 0}>
            {openItems.map((e) => (
              <Row
                key={e.id}
                entry={e}
                onOptimisticToggle={(id, boughtAt) =>
                  applyOptimistic({ kind: "toggle", id, boughtAt })
                }
                onOptimisticRemove={(id) =>
                  applyOptimistic({ kind: "remove", id })
                }
                onRefresh={() => router.refresh()}
              />
            ))}
          </Section>

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
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {empty ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
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
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center">
      <ShoppingBasket className="size-10 text-muted-foreground" aria-hidden />
      <h2 className="mt-3 text-base font-medium">Liste ist leer</h2>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">
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
  onRefresh: () => void;
};

function Row({
  entry,
  onOptimisticToggle,
  onOptimisticRemove,
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

  const qtyLabel =
    entry.quantity != null
      ? `${entry.quantity}${entry.unit ? ` ${entry.unit}` : ""}`
      : null;

  return (
    <li
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-opacity ${
        isBought ? "bg-muted/30" : "bg-background"
      }`}
    >
      <button
        type="button"
        onClick={handleToggle}
        disabled={pending}
        role="checkbox"
        aria-checked={isBought}
        aria-label={isBought ? "Nicht gekauft markieren" : "Gekauft markieren"}
        className={`grid size-5 shrink-0 place-items-center rounded border transition-colors ${
          isBought
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/40 hover:border-primary"
        }`}
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

      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm ${
            isBought ? "text-muted-foreground line-through" : "font-medium"
          }`}
        >
          {name}
          {qtyLabel && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {qtyLabel}
            </span>
          )}
        </p>
        {entry.brand && !entry.customName && (
          <p className="truncate text-xs text-muted-foreground">
            {entry.brand}
          </p>
        )}
      </div>

      {/* Right-hand actions. Order depends on state:
          - open   → Share-Button (Bring!/andere Apps), Löschen
          - bought → "In den Vorrat" (primary), Löschen
          The "In den Vorrat" link is a prominent primary so the
          "check off → move to stock" loop is one tap. */}
      {isBought ? (
        <>
          <Link
            href={`/add?fromShopping=${entry.id}`}
            className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Package className="size-3.5" aria-hidden /> In den Vorrat
          </Link>
        </>
      ) : (
        <ShareButton name={name} />
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
        className="text-muted-foreground hover:text-foreground"
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

/**
 * Share the entry's name through the native OS share sheet.
 *
 * Bring! and all other shopping / note / messaging apps register
 * themselves as share targets for `text/plain`, so this is the
 * platform-correct path for "send this item to Bring!" (or WhatsApp,
 * or Notes, or …) without needing an app-specific deeplink. Bring!
 * does not publish a single-item import URL scheme — the recipe
 * deeplink (`api.getbring.com/rest/bringrecipes/deeplink`) expects a
 * full hosted recipe URL, which we don't have for a plain shopping
 * entry.
 *
 * Fallbacks, in order:
 *   1. `navigator.share` — mobile Safari / Chrome / most Android
 *   2. `navigator.clipboard.writeText` — desktop & older mobile
 *   3. toast.error — truly ancient browser, user is on their own
 *
 * We don't try to open Bring! directly anymore: `bring://` is not a
 * published public URL scheme, and silently doing nothing when the app
 * isn't installed made the button feel broken. The share sheet makes
 * the action discoverable and honest.
 */
function ShareButton({ name }: { name: string }) {
  async function handleShare() {
    // Feature-detect — the property is undefined in SSR and on browsers
    // that don't expose the Web Share API (most desktop Firefox, older
    // Chromium).
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ text: name, title: name });
        return;
      } catch (err) {
        // `AbortError` = user cancelled the share sheet. That's not a
        // failure worth surfacing — bail silently.
        if (err instanceof Error && err.name === "AbortError") return;
        // Any other failure: fall through to clipboard.
      }
    }
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard?.writeText
    ) {
      try {
        await navigator.clipboard.writeText(name);
        toast.success("Name kopiert", {
          description: "In Bring! einfügen oder in der gewünschten App teilen.",
          duration: 4000,
        });
        return;
      } catch {
        // fall through
      }
    }
    toast.error("Teilen nicht unterstützt");
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      aria-label="Teilen (z.B. in Bring!)"
      title="Teilen (z.B. in Bring!)"
    >
      <Share2 className="size-4" aria-hidden />
    </button>
  );
}
