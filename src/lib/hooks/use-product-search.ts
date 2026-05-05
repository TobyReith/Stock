"use client";

import { useEffect, useRef, useState } from "react";
import type { ProductSearchResult } from "@/app/api/product-search/route";

export type { ProductSearchResult };

/**
 * Debounced product-name search against /api/product-search.
 *
 * - Fires only after the query has been stable for 250 ms.
 * - Aborts the previous in-flight request when a new one is issued.
 * - Returns empty results (not an error) on abort or network failure.
 */
export function useProductSearch(query: string) {
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    // Cancel any in-flight request from the previous effect run.
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/product-search?q=${encodeURIComponent(trimmed)}`,
          { signal: ac.signal },
        );
        if (res.ok) {
          const data = (await res.json()) as {
            products: ProductSearchResult[];
          };
          setResults(data.products);
        }
      } catch (err) {
        // AbortError is expected; any other error silently clears results.
        if ((err as Error).name !== "AbortError") setResults([]);
      } finally {
        if (!ac.signal.aborted) setIsLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(timeout);
      ac.abort();
    };
  }, [query]);

  return { results, isLoading };
}
