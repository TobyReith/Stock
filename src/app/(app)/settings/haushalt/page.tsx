import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/session";
import { getActiveHouseholdId } from "@/lib/households/active";
import { listHouseholdMembers } from "@/lib/households/members";
import { buttonVariants } from "@/components/ui/button";
import { InviteGenerator } from "./invite-generator";
import { ActiveInvites, type InviteRow } from "./active-invites";
import { MemberList } from "./member-list";
import { LeaveButton } from "./leave-button";
import { RenameForm } from "./rename-form";

export const metadata = { title: "Haushalt" };

/**
 * Household-management hub.
 *
 * Sections (all rendered server-side; the children opt into client
 * interactivity where needed):
 *   1. **Aktueller Haushalt** — name + role badge. Owners see a rename
 *      form; non-owners just see the static name.
 *   2. **Einladungen** (owner-only) — generator + revoke list.
 *   3. **Mitglieder** — list with role + joined-at. Owners can remove
 *      non-owner members via a confirm dialog. Everyone sees the leave
 *      button, with a last-owner guard.
 *
 * Data fetches are parallel so the page paints in one round-trip. We
 * pull members via the admin client (see `listHouseholdMembers`) so we
 * can resolve each member's email — `auth.users` isn't exposed through
 * the user client.
 */
export default async function HaushaltPage() {
  // Both helpers are `cache()`-wrapped — shares with the layout's
  // `getCurrentUser()` call at no extra cost.
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  // Layout redirects unauthenticated users; defensive only.
  if (!user) return null;

  const activeHouseholdId = await getActiveHouseholdId(supabase, user.id);

  // Fresh user / no memberships yet.
  if (!activeHouseholdId) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">
          Du hast noch keinen Haushalt. Füge einen Artikel hinzu, um zu starten,
          oder nutze einen Einladungscode.
        </p>
      </Shell>
    );
  }

  // Pull everything for the page in parallel.
  const [householdResult, memberResult, invitesResult, members] =
    await Promise.all([
      supabase
        .from("households")
        .select("id, name")
        .eq("id", activeHouseholdId)
        .maybeSingle(),
      supabase
        .from("household_members")
        .select("role")
        .eq("household_id", activeHouseholdId)
        .eq("user_id", user.id)
        .maybeSingle(),
      // `invites_select_owner` returns rows only when the caller owns
      // the household — non-owners get `[]` here with no branching.
      supabase
        .from("invites")
        .select("code, expires_at, redeemed_at")
        .eq("household_id", activeHouseholdId)
        .is("redeemed_at", null)
        .order("created_at", { ascending: false }),
      listHouseholdMembers(activeHouseholdId),
    ]);

  const household = householdResult.data;
  const isOwner = memberResult.data?.role === "owner";
  const invites: InviteRow[] = (invitesResult.data ?? []).map((row) => ({
    code: row.code,
    expiresAt: row.expires_at,
  }));
  // "Last owner" = only one owner in the household and it's the current
  // user. `leaveHousehold` re-validates this server-side; the flag here
  // just decides whether to disable the button in the UI.
  const ownerCount = members.filter((m) => m.role === "owner").length;
  const isLastOwner = isOwner && ownerCount <= 1;

  return (
    <Shell>
      <section aria-labelledby="household-heading" className="flex flex-col gap-2">
        <h2
          id="household-heading"
          className="text-sm font-medium text-muted-foreground"
        >
          Aktueller Haushalt
        </h2>
        <div className="rounded-lg border px-4 py-3">
          {isOwner && household ? (
            <RenameForm
              householdId={household.id}
              currentName={household.name}
            />
          ) : (
            <p className="text-sm font-medium">
              {household?.name ?? "Unbekannter Haushalt"}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {isOwner ? "Du bist Owner." : "Du bist Mitglied."}
          </p>
        </div>
      </section>

      {isOwner && (
        <section aria-labelledby="invite-heading" className="flex flex-col gap-3">
          <div>
            <h2 id="invite-heading" className="text-sm font-medium text-muted-foreground">
              Einladungen
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Codes sind 7 Tage gültig und können nur einmal eingelöst werden.
            </p>
          </div>
          <InviteGenerator householdId={activeHouseholdId} />
          <ActiveInvites invites={invites} />
        </section>
      )}

      <section aria-labelledby="members-heading" className="flex flex-col gap-3">
        <h2 id="members-heading" className="text-sm font-medium text-muted-foreground">
          Mitglieder
        </h2>
        <MemberList
          householdId={activeHouseholdId}
          members={members.map((m) => ({
            userId: m.userId,
            email: m.email,
            role: m.role,
            joinedAt: m.joinedAt,
          }))}
          currentUserId={user.id}
          isOwner={isOwner}
        />
        <LeaveButton
          householdId={activeHouseholdId}
          householdName={household?.name ?? "Haushalt"}
          isLastOwner={isLastOwner}
        />
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <header className="mb-6 flex items-center gap-2">
        <Link
          href="/settings"
          className={buttonVariants({ variant: "ghost", size: "icon" })}
          aria-label="Zurück"
        >
          <ArrowLeft aria-hidden />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Haushalt</h1>
      </header>
      <div className="flex flex-col gap-6">{children}</div>
    </div>
  );
}
