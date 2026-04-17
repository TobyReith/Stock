import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { PushToggle } from "./push-toggle";

export const metadata = { title: "Einstellungen" };

/**
 * Settings page — Phase 2.1 scope: push opt-in only.
 *
 * Theme toggle, logout, and account deletion land in Phase 2.4; see
 * `docs/PHASE2.md`. Keeping this page single-section for now so each
 * later addition is a clean, reviewable diff.
 *
 * The VAPID public key is read here (server-side) and passed to the
 * client toggle as a prop. `NEXT_PUBLIC_*` env vars are also visible on
 * the client, but threading it as a prop makes the dependency explicit
 * and surfaces a "key fehlt" error state before the user taps anything.
 */
export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // `(app)/layout.tsx` redirects unauthenticated users, so `!user` here
  // is defensive only.
  if (!user) return null;

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <header className="mb-6 flex items-center gap-2">
        <Link
          href="/"
          className={buttonVariants({ variant: "ghost", size: "icon" })}
          aria-label="Zurück"
        >
          <ArrowLeft aria-hidden />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Einstellungen</h1>
      </header>

      <section aria-labelledby="notifications-heading" className="flex flex-col gap-3">
        <h2
          id="notifications-heading"
          className="text-sm font-medium text-muted-foreground"
        >
          Benachrichtigungen
        </h2>
        <PushToggle vapidPublicKey={vapidPublicKey} />
      </section>
    </div>
  );
}
