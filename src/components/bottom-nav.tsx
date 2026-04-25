"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ChefHat, Package, Plus, ShoppingCart } from "lucide-react";
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
  { href: "/recipes", label: "Kochen", icon: ChefHat },
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
