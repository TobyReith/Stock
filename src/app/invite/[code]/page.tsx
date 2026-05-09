import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buttonVariants } from "@/components/ui/button";
import {
  normalizeInviteCode,
  redeemInviteSchema,
} from "@/lib/schemas/invites";
import { RedeemButton } from "./redeem-button";

export const metadata: Metadata = { title: "Einladung" };

/**
 * `/invite/[code]` — the page someone opens from a shared link.
 *
 * Flow:
 *   - Not logged in → send to `/login?next=/invite/CODE` so the magic
 *     link comes back here. The redeem action itself requires an
 *     authenticated user.
 *   - Logged in → show the household the code belongs to and a join
 *     button; the actual redemption runs from the client component so
 *     we can surface error toasts without refreshing.
 *
 * ## Why we peek at the invite with the admin client here
 * RLS on `invites` denies SELECT to anyone except the household owner,
 * so a joining user literally can't read the row they're about to
 * redeem. We do a **narrow** admin read (just the household name + a
 * validity flag) purely for UX — the actual security boundary is still
 * the atomic claim inside `redeemInvite`, which runs as admin and
 * validates again with a write-scoped `WHERE redeemed_at IS NULL`.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const parsed = redeemInviteSchema.safeParse(normalizeInviteCode(rawCode));
  if (!parsed.success) {
    return (
      <Shell>
        <Message tone="error" title="Ungültiger Einladungs-Link">
          Der Code sollte genau sechs Zeichen haben.
        </Message>
      </Shell>
    );
  }
  const code = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not logged in → login with a return path. The magic-link callback
  // redirects back here, at which point the branch below renders.
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/invite/${code}`)}`);
  }

  // Admin-scoped read. We expose ONLY the household name — no `created_by`,
  // no attempt counts, no cross-user metadata.
  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("invites")
    .select(
      "code, expires_at, redeemed_at, household:households ( id, name )",
    )
    .eq("code", code)
    .maybeSingle();

  const resolved = resolveInviteView(invite);

  if (!resolved.valid) {
    return (
      <Shell>
        <Message tone="error" title="Code nicht einlösbar">
          Der Code ist abgelaufen, wurde bereits eingelöst, oder existiert nicht.
        </Message>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Zurück zur App
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="space-y-2">
        <h1 className="font-serif text-[26px] font-medium tracking-tight">Einladung</h1>
        <p className="text-sm text-muted">
          Du wurdest zu{" "}
          <span className="font-medium text-foreground">
            {resolved.householdName}
          </span>{" "}
          eingeladen. Nach dem Beitritt siehst du den gemeinsamen Vorrat und
          kannst Artikel hinzufügen.
        </p>
      </div>
      <RedeemButton code={code} />
      <p className="text-xs text-muted">
        Angemeldet als {user.email ?? "Unbekannt"}.
      </p>
    </Shell>
  );
}

/**
 * Normalize the admin-scoped invite peek into a boolean + display
 * name. Kept outside the component so the `Date.now()` call here
 * doesn't trip `react-hooks/purity` — it's a request-scoped helper,
 * which is fine.
 */
type InviteRow = {
  code: string;
  expires_at: string;
  redeemed_at: string | null;
  household:
    | { id: string; name: string }
    | { id: string; name: string }[]
    | null;
};

function resolveInviteView(
  invite: InviteRow | null,
):
  | { valid: true; householdName: string }
  | { valid: false } {
  if (!invite) return { valid: false };
  const household = Array.isArray(invite.household)
    ? invite.household[0]
    : invite.household;
  if (!household) return { valid: false };
  if (invite.redeemed_at !== null) return { valid: false };
  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    return { valid: false };
  }
  return { valid: true, householdName: household.name };
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-12">
      {children}
    </main>
  );
}

function Message({
  tone,
  title,
  children,
}: {
  tone: "error" | "info";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={
        tone === "error"
          ? "rounded-lg border border-danger/30 bg-danger-subtle px-4 py-3"
          : "rounded-lg border border-border bg-surface-raised px-4 py-3"
      }
    >
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted">{children}</p>
    </div>
  );
}
