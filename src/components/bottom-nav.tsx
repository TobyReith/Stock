"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ChefHat, Package, Plus, ShoppingCart, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Exact-match: only `/` itself is active, not every deep route */
  exact?: boolean;
};

const items: NavItem[] = [
  { href: "/", label: "Vorrat", icon: Package, exact: true },
  { href: "/shopping", label: "Einkauf", icon: ShoppingCart },
  { href: "/recipes", label: "Kochen", icon: ChefHat },
  { href: "/stats", label: "Historie", icon: BarChart3 },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <>
      {/* Floating action button */}
      <Link
        href="/add"
        aria-label="Hinzufügen"
        className={cn(
          "fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] right-4 z-50",
          "flex size-14 items-center justify-center rounded-full",
          "bg-primary text-primary-fg transition-opacity hover:bg-sage-400",
          pathname.startsWith("/add") && "opacity-70",
        )}
      >
        <Plus className="size-6" aria-hidden />
      </Link>

      {/* Bottom navigation bar */}
      <nav
        aria-label="Hauptnavigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto flex h-14 max-w-md items-stretch justify-around">
          {items.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  prefetch
                  aria-current={active ? "page" : undefined}
                  onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.vibrate) {
                      navigator.vibrate(10);
                    }
                  }}
                  className={cn(
                    "flex h-full flex-col items-center justify-center gap-0.5 text-[11px] transition-colors",
                    active
                      ? "text-foreground"
                      : "text-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-5" strokeWidth={active ? 2 : 1.75} aria-hidden />
                  <span>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
