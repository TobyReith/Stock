"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { loginSchema, type LoginInput } from "@/lib/schemas/auth";
import { safeNext } from "@/lib/auth/safe-next";
import { friendlyAuthError } from "@/lib/auth/errors";
import { FORGOT_PASSWORD_PATH, SIGNUP_PATH } from "@/lib/auth/paths";

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
      toast.error("Anmelden fehlgeschlagen", {
        description: friendlyAuthError(error.message, "login"),
      });
      return;
    }
    toast.success("Willkommen zurück.");
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
        autoComplete="current-password"
        error={errors.password?.message}
        labelAdornment={
          <Link
            href={`${FORGOT_PASSWORD_PATH}${nextQuery}`}
            className="text-xs text-muted hover:text-foreground hover:underline"
          >
            Passwort vergessen?
          </Link>
        }
        {...register("password")}
      />

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Anmelden…" : "Anmelden"}
      </Button>

      <p className="text-center text-xs text-muted">
        Noch kein Konto?{" "}
        <Link
          href={`${SIGNUP_PATH}${nextQuery}`}
          className="font-medium text-foreground hover:underline"
        >
          Konto erstellen
        </Link>
      </p>
    </form>
  );
}
