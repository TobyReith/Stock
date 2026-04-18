"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginSchema, type LoginInput } from "@/lib/schemas/auth";
import { safeNext } from "@/lib/auth/safe-next";

/**
 * Email + password sign-in. Replaces the magic-link form — new users
 * now go through `/signup`, existing users enter their chosen password
 * here. Forgot-password link is right on the form so locked-out users
 * don't have to hunt for it.
 *
 * The `?next=` param is preserved through signup and forgot links so an
 * invite-triggered redirect survives any detour.
 */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const nextQuery = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit({ email, password }: LoginInput) {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error("Anmelden fehlgeschlagen", { description: friendlyAuthError(error.message) });
      return;
    }
    toast.success("Willkommen zurück.");
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="password">Passwort</Label>
          <Link
            href={`/auth/forgot-password${nextQuery}`}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            Passwort vergessen?
          </Link>
        </div>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!errors.password}
          {...register("password")}
        />
        {errors.password && (
          <p className="text-xs text-destructive">{errors.password.message}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Anmelden…" : "Anmelden"}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Noch kein Konto?{" "}
        <Link
          href={`/signup${nextQuery}`}
          className="font-medium text-foreground hover:underline"
        >
          Konto erstellen
        </Link>
      </p>
    </form>
  );
}

/**
 * Map the common Supabase auth error strings to human copy. We don't
 * enumerate every branch — anything unmapped falls through unchanged so
 * the user at least sees a hint rather than silence.
 */
function friendlyAuthError(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes("invalid login")) return "E-Mail oder Passwort stimmen nicht.";
  if (msg.includes("email not confirmed"))
    return "Bitte bestätige zuerst deine E-Mail-Adresse.";
  if (msg.includes("rate limit")) return "Zu viele Versuche. Bitte später erneut.";
  return raw;
}
