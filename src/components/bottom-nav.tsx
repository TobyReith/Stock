"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Package, Plus, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Exact-match: only `/` itself is active, not every deep route */
  exact?: boolean;
};

const items: NavItem[] = [
  { href: "/", label: "Vorrat", icon: Package, exact: true },
  { href: "/add", label: "Hinzufügen", icon: Plus },
  { href: "/shopping", label: "Einkauf", icon: ShoppingCart },
  { href: "/stats", label: "Historie", icon: BarChart3 },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Hauptnavigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex h-16 max-w-md items-stretch justify-around">
        {items.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              {/*
                `prefetch` is `"auto"` by default, which for *dynamic*
                routes (our tabs are all dynamic — auth + household) only
                prefetches down to the first `loading.tsx` boundary. That
                ships the shell and lets the Client Router Cache hold the
                next tab's skeleton ready, so tapping is instant. We
                explicitly pass `true` here so full-route + data
                prefetch runs too: the bottom nav is in the viewport on
                every app screen, and a user will tap one of these within
                a second or two of landing — the extra prefetch work is
                well-amortized. Combined with `experimental.staleTimes`
                (dynamic: 30s) this is what makes tab switching feel
                local rather than network-bound.
              */}
              <Link
                href={href}
                prefetch
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-6" aria-hidden />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
