"use client";

import { useId, useRef, useState } from "react";
import { Loader2, Package } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  useProductSearch,
  type ProductSearchResult,
} from "@/lib/hooks/use-product-search";
import { cn } from "@/lib/utils";

export type { ProductSearchResult };

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Called when the user picks a suggestion from the list. */
  onSelect: (result: ProductSearchResult) => void;
  placeholder?: string;
  autoFocus?: boolean;
  required?: boolean;
};

/**
 * Product-name input with an OFF-backed autocomplete dropdown.
 *
 * Triggers after 2 characters (debounced 250 ms). Keyboard: ↑↓ to
 * move, Enter to confirm, Escape to close. Screen-reader friendly via
 * ARIA combobox pattern.
 */
export function ProductAutocomplete({
  id,
  value,
  onChange,
  onSelect,
  placeholder = "z.B. Haferflocken",
  autoFocus,
  required,
}: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const { results, isLoading } = useProductSearch(value);
  const showList = open && (results.length > 0 || (isLoading && value.trim().length >= 2));

  function handleSelect(result: ProductSearchResult) {
    onSelect(result);
    onChange(result.name);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showList) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, -1));
        break;
      case "Enter":
        if (activeIndex >= 0) {
          e.preventDefault();
          const r = results[activeIndex];
          if (r) handleSelect(r);
        }
        break;
      case "Escape":
        setOpen(false);
        setActiveIndex(-1);
        break;
    }
  }

  return (
    <div className="relative">
      <div className="relative">
        <Input
          ref={inputRef}
          id={id}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay so a pointer-down on a list item registers before blur hides it.
            setTimeout(() => setOpen(false), 150);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          required={required}
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-autocomplete="list"
          aria-controls={showList ? listId : undefined}
          aria-activedescendant={
            activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
          }
          className={cn("pr-8", showList && "rounded-b-none")}
        />
        {isLoading && value.trim().length >= 2 && (
          <Loader2
            aria-hidden
            className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted"
          />
        )}
      </div>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Produktvorschläge"
          className="absolute left-0 right-0 top-full z-50 max-h-72 overflow-y-auto rounded-b-lg border border-t-0 border-border bg-surface"
        >
          {isLoading && results.length === 0 ? (
            <li className="flex items-center gap-2 px-3 py-2.5 text-sm text-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Suche…
            </li>
          ) : (
            results.map((result, i) => (
              <li
                key={result.barcode}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                // prevent blur from firing before click registers
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(result)}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm transition-colors",
                  i === activeIndex
                    ? "bg-surface-raised text-foreground"
                    : "hover:bg-surface-raised hover:text-foreground",
                  i > 0 && "border-t border-border",
                )}
              >
                {/* Thumbnail */}
                <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface-raised">
                  {result.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={result.imageUrl}
                      alt=""
                      className="size-full object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <Package className="size-5 text-muted" aria-hidden />
                  )}
                </div>

                {/* Name + meta */}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium leading-tight">
                    {result.name}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {[result.brand, result.quantity].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
