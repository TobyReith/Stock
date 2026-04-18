"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronDown, Settings, Users } from "lucide-react";
import { Menu } from "@base-ui/react/menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { switchActiveHousehold } from "@/lib/actions/households";

export type SwitcherMembership = {
  id: string;
  name: string;
  role: "owner" | "member";
};

type Props = {
  memberships: SwitcherMembership[];
  activeId: string | null;
};

/**
 * Header household switcher.
 *
 * The server-rendered parent passes the full membership list + the
 * currently active id. We avoid fetching on the client because the
 * switcher is always rendered alongside a list whose data is already
 * scoped to `activeId` — fetching again would duplicate the round-trip.
 *
 * Render states:
 *   - **0 memberships** — render nothing. The parent page already shows
 *     a fresh-user empty state; a static "Kein Haushalt" pill would be
 *     duplicated noise.
 *   - **1 membership** — static read-only pill. Offering a switcher
 *     that has nothing to switch to is a dead affordance.
 *   - **≥2 memberships** — base-ui Menu. `useTransition` keeps the page
 *     responsive while the server action re-validates the layout; on
 *     failure we surface a toast and skip the refresh.
 */
export function HouseholdSwitcher({ memberships, activeId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Nothing to render before the user has a household at all.
  if (memberships.length === 0) return null;

  const active = memberships.find((m) => m.id === activeId) ?? null;
  const label = active?.name ?? memberships[0].name;

  // Exactly one membership — static pill.
  if (memberships.length === 1) {
    return (
      <div
        className="inline-flex items-center gap-1.5 rounded-full bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground"
        aria-label={`Aktiver Haushalt: ${label}`}
      >
        <Users aria-hidden className="size-3.5" />
        <span className="truncate max-w-[10rem]">{label}</span>
      </div>
    );
  }

  function handleSelect(id: string) {
    if (id === activeId) return;
    startTransition(async () => {
      const result = await switchActiveHousehold(id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      // Server action already revalidated; refresh so the RSC tree
      // re-reads with the new active cookie.
      router.refresh();
    });
  }

  return (
    <Menu.Root>
      <Menu.Trigger
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-transparent bg-muted/50 px-2.5 py-1 text-xs font-medium transition-colors",
          "hover:bg-muted hover:text-foreground",
          "focus-visible:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "aria-expanded:bg-muted aria-expanded:text-foreground",
          pending && "opacity-60",
        )}
        disabled={pending}
      >
        <Users aria-hidden className="size-3.5" />
        {/*
         * SR-only prefix so the trigger announces "Haushalt wechseln, Flat
         * 42, Menü" instead of just the household name. Visual layout is
         * unchanged — the visible label stays the pill text.
         */}
        <span className="sr-only">Haushalt wechseln: </span>
        <span className="truncate max-w-[10rem]">{label}</span>
        <ChevronDown aria-hidden className="size-3.5" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="start" className="z-50">
          <Menu.Popup
            className={cn(
              "min-w-[16rem] overflow-hidden rounded-lg border bg-popover p-1 text-sm shadow-lg",
              "transition duration-150 ease-out",
              "data-starting-style:opacity-0 data-starting-style:-translate-y-1",
              "data-ending-style:opacity-0 data-ending-style:-translate-y-1",
            )}
          >
            <Menu.Group>
              <Menu.GroupLabel className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Haushalte
              </Menu.GroupLabel>
              {memberships.map((m) => (
                <Menu.Item
                  key={m.id}
                  onClick={() => handleSelect(m.id)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 outline-none",
                    "data-highlighted:bg-muted data-highlighted:text-foreground",
                  )}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{m.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {m.role === "owner" ? "Owner" : "Mitglied"}
                    </span>
                  </span>
                  {m.id === activeId && (
                    <Check aria-hidden className="size-4 shrink-0 text-foreground" />
                  )}
                </Menu.Item>
              ))}
            </Menu.Group>
            <div className="my-1 h-px bg-border" role="none" />
            <Menu.Item
              render={
                <Link
                  href="/settings/haushalt"
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 outline-none",
                    "data-highlighted:bg-muted data-highlighted:text-foreground",
                  )}
                />
              }
            >
              <Settings aria-hidden className="size-4" />
              <span>Haushalt verwalten</span>
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
