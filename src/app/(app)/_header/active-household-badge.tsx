import Link from "next/link";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  getActiveHouseholdId,
  listMemberships,
} from "@/lib/households/active";

/**
 * Read-only "you're adding to X" / "you're viewing stats for X" pill,
 * shown on `/add` and `/stats`.
 *
 * Intentionally server-rendered + passive: those pages don't host the
 * full switcher (it'd be a dead affordance mid-flow), but a user with
 * multiple households deserves confirmation of *which* household they're
 * about to write to or slice stats against.
 *
 * Rendering rules:
 *   - Not logged in → nothing. The page's own auth path handles it.
 *   - 0 or 1 membership → nothing. Single-household users don't need
 *     the visual noise — the list page already shows the switcher.
 *   - ≥2 memberships → render the pill. Linked to `/settings/haushalt`
 *     so the user can switch from there (or open the full switcher on
 *     the home page, which is one tap away on the bottom nav).
 */
export async function ActiveHouseholdBadge() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [activeHouseholdId, memberships] = await Promise.all([
    getActiveHouseholdId(supabase, user.id),
    listMemberships(supabase, user.id),
  ]);

  if (memberships.length < 2) return null;

  const active =
    memberships.find((m) => m.id === activeHouseholdId) ?? memberships[0];

  return (
    <Link
      href="/settings/haushalt"
      className="inline-flex items-center gap-1.5 rounded-full bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Users aria-hidden className="size-3.5" />
      <span className="sr-only">Aktiver Haushalt: </span>
      <span className="max-w-[10rem] truncate">{active.name}</span>
    </Link>
  );
}
