"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  forgotPasswordSchema,
  type ForgotPasswordInput,
} from "@/lib/schemas/auth";
import { safeNext } from "@/lib/auth/safe-next";

/**
 * Password-reset request form.
 *
 * Sends a recovery email via `auth.resetPasswordForEmail`. The email
 * link lands on `/auth/callback?code=...&next=/auth/reset-password`;
 * the callback exchanges the code for a session, then `/auth/reset-
 * password` lets the user set a new one.
 *
 * Security: we always show the "mail sent" confirmation, even when the
 * email isn't registered. Supabase itself returns 200 for unknown
 * addresses by default, so we don't want to paper over that with an
 * error that'd leak account existence.
 */
export function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const nextQuery = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;

  const [sent, setSent] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  async function onSubmit({ email }: ForgotPasswordInput) {
    const supabase = createClient();
    const callback = new URL("/auth/callback", window.location.origin);
    callback.searchParams.set("next", "/auth/reset-password");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: callback.toString(),
    });
    if (error) {
      toast.error("Konnte Link nicht senden", { description: error.message });
      return;
    }
    setSent(email);
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border p-4 text-sm text-muted-foreground">
          Wenn ein Konto zu{" "}
          <span className="font-medium text-foreground">{sent}</span>{" "}
          existiert, haben wir einen Link zum Zurücksetzen verschickt.
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

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Wird gesendet…" : "Link senden"}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        <Link
          href={`/login${nextQuery}`}
          className="font-medium text-foreground hover:underline"
        >
          Zurück zum Anmelden
        </Link>
      </p>
    </form>
  );
}
