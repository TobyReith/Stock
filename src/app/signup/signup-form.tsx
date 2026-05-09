"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { signupSchema, type SignupInput } from "@/lib/schemas/auth";
import { safeNext } from "@/lib/auth/safe-next";
import { friendlyAuthError } from "@/lib/auth/errors";
import {
  AUTH_CALLBACK_PATH,
  FORGOT_PASSWORD_PATH,
  LOGIN_PATH,
} from "@/lib/auth/paths";

/**
 * Account creation — name, email, password. Name lands in Supabase's
 * `user_metadata.full_name` so we don't need a separate `profiles`
 * table yet; if/when we display names in the UI we pull from there.
 *
 * Two success branches:
 *   - `session` is present → email confirmation is *off* in the Supabase
 *     project, the user is logged in, push them to `next`.
 *   - `session` is null → confirmation is on, show the "check your
 *     inbox" state and wait for them to click the confirmation link,
 *     which routes back through `/auth/callback`.
 */
export function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const nextQuery = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;

  const [confirmSent, setConfirmSent] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({ resolver: zodResolver(signupSchema) });

  async function onSubmit({ name, email, password }: SignupInput) {
    const supabase = createClient();
    const callback = new URL(AUTH_CALLBACK_PATH, window.location.origin);
    if (next !== "/") callback.searchParams.set("next", next);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: callback.toString(),
      },
    });
    if (error) {
      toast.error("Registrierung fehlgeschlagen", {
        description: friendlyAuthError(error.message, "signup"),
      });
      return;
    }

    if (data.session) {
      // Email confirmation is off → instant login.
      toast.success("Willkommen bei Stock.");
      router.push(next);
      router.refresh();
      return;
    }

    // Confirmation required — let them know.
    setConfirmSent(email);
  }

  if (confirmSent) {
    // Supabase returns 200-with-null-session for both "new user, mail
    // queued" *and* "email already registered" — the API deliberately
    // hides that distinction to prevent account enumeration. Which
    // means this success branch covers a case where *no* mail goes
    // out. The recovery-link hint below gives the user a way forward
    // without us having to leak that fact: anyone who already owned
    // that email reads it as "oh right, I already have an account",
    // a genuinely new user reads it as "useful if the mail doesn't
    // arrive." The `email` query pre-fills the forgot-password form.
    const forgotHref =
      `${FORGOT_PASSWORD_PATH}?email=${encodeURIComponent(confirmSent)}` +
      (next === "/" ? "" : `&next=${encodeURIComponent(next)}`);
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-surface-raised p-4 text-sm text-muted">
          Wir haben dir eine Bestätigungsmail an{" "}
          <span className="font-medium text-foreground">{confirmSent}</span>{" "}
          geschickt. Klicke den Link in der E-Mail, um dein Konto zu
          aktivieren.
        </div>
        <p className="text-xs text-muted">
          Keine Mail erhalten oder bereits ein Konto?{" "}
          <Link
            href={forgotHref}
            className="font-medium text-foreground hover:underline"
          >
            Passwort zurücksetzen
          </Link>
          .
        </p>
        <p className="text-center text-xs text-muted">
          <Link
            href={`${LOGIN_PATH}${nextQuery}`}
            className="font-medium text-foreground hover:underline"
          >
            Zurück zum Anmelden
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <FormField
        id="name"
        label="Name"
        type="text"
        autoComplete="name"
        placeholder="Wie sollen wir dich nennen?"
        error={errors.name?.message}
        {...register("name")}
      />

      <FormField
        id="email"
        label="E-Mail"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="du@beispiel.de"
        error={errors.email?.message}
        {...register("email")}
      />

      <FormField
        id="password"
        label="Passwort"
        type="password"
        autoComplete="new-password"
        error={errors.password?.message}
        hint="Mindestens 8 Zeichen."
        {...register("password")}
      />

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Wird angelegt…" : "Konto erstellen"}
      </Button>

      <p className="text-center text-xs text-muted">
        Schon registriert?{" "}
        <Link
          href={`${LOGIN_PATH}${nextQuery}`}
          className="font-medium text-foreground hover:underline"
        >
          Anmelden
        </Link>
      </p>
    </form>
  );
}
