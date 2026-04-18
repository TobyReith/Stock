import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveHouseholdId } from "@/lib/households/active";
import { buttonVariants } from "@/components/ui/button";
import { InviteGenerator } from "./invite-generator";
import { ActiveInvites, type InviteRow } from "./active-invites";

export const metadata = { title: "Haushalt" };

/**
 * Phase 2.2 household-management page.
 *
 * This PR covers invite creation + revocation. Member listing and
 * leave/remove controls land in the next PR — we leave a visible stub
 * below so the page already looks like the final layout.
 *
 * Server-side: we resolve the active household, load its name (to show
 * who the invite is for) and fetch the owner-visible invite rows via
 * the user client. RLS (`invites_select_owner`) does the authorization
 * — non-owners see an empty list and a disabled create action.
 */
export default async function HaushaltPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Layout redirects unauthenticated users; defensive only.
  if (!user) return null;

  const activeHouseholdId = await getActiveHouseholdId(supabase, user.id);

  // No household yet (fresh user) → show a hint. First add-flow bootstraps.
  if (!activeHouseholdId) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">
          Du hast noch keinen Haushalt. Füge einen Artikel hinzu, um zu starten.
        </p>
      </Shell>
    );
  }

  // Pull household name + owner status + active invites in parallel.
  const [householdResult, memberResult, invitesResult] = await Promise.all([
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
    // `invites_select_owner` returns rows only when the caller owns the
    // household — non-owners get `[]` here without any branching on our
    // side.
    supabase
      .from("invites")
      .select("code, expires_at, redeemed_at")
      .eq("household_id", activeHouseholdId)
      .is("redeemed_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const household = householdResult.data;
  const isOwner = memberResult.data?.role === "owner";
  const invites: InviteRow[] = (invitesResult.data ?? []).map((row) => ({
    code: row.code,
    expiresAt: row.expires_at,
  }));

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
          <p className="text-sm font-medium">
            {household?.name ?? "Unbekannter Haushalt"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
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

      <section aria-labelledby="members-heading" className="flex flex-col gap-2">
        <h2 id="members-heading" className="text-sm font-medium text-muted-foreground">
          Mitglieder
        </h2>
        <div className="rounded-lg border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">
          Mitglieder-Verwaltung kommt im nächsten Update.
        </div>
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
