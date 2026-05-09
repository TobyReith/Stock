"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

type ThemeKey = "light" | "dark" | "system";

const OPTIONS: { key: ThemeKey; label: string; icon: typeof Sun }[] = [
  { key: "light", label: "Hell", icon: Sun },
  { key: "dark", label: "Dunkel", icon: Moon },
  { key: "system", label: "System", icon: Monitor },
];

/**
 * Three-way theme picker (light / dark / system).
 *
 * `next-themes` only reads the persisted value after the client mounts,
 * so we gate on `mounted` to avoid the hydration flash where the wrong
 * option briefly appears selected. Until mount we render the pill row
 * with nothing highlighted — visually identical bar one subtle ring.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // next-themes reads the persisted value only after mount. Flipping
    // `mounted` here is the canonical guard against a hydration flash
    // where the wrong option briefly reads as selected; it runs exactly
    // once so the cascading-render concern doesn't apply.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  return (
    <div
      role="radiogroup"
      aria-label="Farbschema"
      className="inline-flex w-full gap-1 rounded-lg border border-border bg-surface p-1"
    >
      {OPTIONS.map(({ key, label, icon: Icon }) => {
        const active = mounted && theme === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(key)}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:border-border-strong",
              active
                ? "bg-surface-raised text-foreground"
                : "text-muted hover:bg-surface-raised",
            )}
          >
            <Icon aria-hidden className="size-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
