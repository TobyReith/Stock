import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LOGIN_PATH } from "@/lib/auth/paths";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Passwort zurücksetzen" };

/**
 * Landing page for the password-reset email link.
 *
 * The flow:
 *   1. User requests reset on `/auth/forgot-password`.
 *   2. Supabase emails a link → `/auth/callback?code=...&next=/auth/reset-password`.
 *   3. Callback exchanges the code for a session, redirects here.
 *   4. This page expects a valid session and shows the "set new
 *      password" form.
 *
 * If somebody hits this URL without a session — because the link
 * expired, was already used, or they opened the page directly — we
 * bounce them to `/login` so they can start over. Doing that on the
 * server keeps the form client-component dumb: if it mounts, it knows
 * there's a user to attach the new password to.
 */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(LOGIN_PATH);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="font-serif text-[26px] font-medium tracking-tight">Neues Passwort</h1>
          <p className="text-sm text-muted">
            Wähle ein neues Passwort für dein Konto.
          </p>
        </div>
        <ResetPasswordForm />
      </div>
    </main>
  );
}
