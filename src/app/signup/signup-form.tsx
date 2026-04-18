"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signupSchema, type SignupInput } from "@/lib/schemas/auth";
import { safeNext } from "@/lib/auth/safe-next";

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
    const callback = new URL("/auth/callback", window.location.origin);
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
        description: friendlySignupError(error.message),
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
    return (
      <div className="space-y-4">
        <div className="rounded-md border p-4 text-sm text-muted-foreground">
          Wir haben dir eine Bestätigungsmail an{" "}
          <span className="font-medium text-foreground">{confirmSent}</span>{" "}
          geschickt. Klicke den Link in der E-Mail, um dein Konto zu
          aktivieren.
        </div>
        <p className="text-center text-xs text-muted-foreground">
          <Link
            href={`/login${nextQuery}`}
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
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          type="text"
          autoComplete="name"
          placeholder="Wie sollen wir dich nennen?"
          aria-invalid={!!errors.name}
          {...register("name")}
        />
        {errors.name && (
          <p className="text-xs text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">E-Mail</Label>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="du@beispiel.de"
          aria-invalid={!!errors.email}
          {...register("email")}
        />
        {errors.email && (
          <p className="text-xs text-destructive">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Passwort</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.password}
          {...register("password")}
        />
        {errors.password ? (
          <p className="text-xs text-destructive">{errors.password.message}</p>
        ) : (
          <p className="text-xs text-muted-foreground">Mindestens 8 Zeichen.</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Wird angelegt…" : "Konto erstellen"}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Schon registriert?{" "}
        <Link
          href={`/login${nextQuery}`}
          className="font-medium text-foreground hover:underline"
        >
          Anmelden
        </Link>
      </p>
    </form>
  );
}

function friendlySignupError(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes("already registered") || msg.includes("user already"))
    return "Diese E-Mail ist bereits registriert. Melde dich stattdessen an.";
  if (msg.includes("weak password") || msg.includes("password"))
    return "Passwort ist zu schwach. Mindestens 8 Zeichen wählen.";
  if (msg.includes("rate limit")) return "Zu viele Versuche. Bitte später erneut.";
  return raw;
}
