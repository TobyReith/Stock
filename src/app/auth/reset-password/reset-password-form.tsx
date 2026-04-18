"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import {
  resetPasswordSchema,
  type ResetPasswordInput,
} from "@/lib/schemas/auth";

/**
 * Submit a new password for the currently-signed-in user (who landed
 * here via the recovery email). Two-field confirmation because a typo
 * now means going through the recovery flow again.
 */
export function ResetPasswordForm() {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
  });

  async function onSubmit({ password }: ResetPasswordInput) {
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error("Passwort nicht gespeichert", { description: error.message });
      return;
    }
    toast.success("Passwort aktualisiert.");
    // Deliberately pushing to `/` rather than propagating a `?next=`
    // here: the recovery flow doesn't carry the original intent (the
    // email link always routes through `/auth/callback?next=/auth/
    // reset-password`), so any `next` we'd have is our own constant.
    // Sending the user home after a successful reset is the least
    // surprising default.
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <FormField
        id="password"
        label="Neues Passwort"
        type="password"
        autoComplete="new-password"
        error={errors.password?.message}
        hint="Mindestens 8 Zeichen."
        {...register("password")}
      />

      <FormField
        id="confirm"
        label="Passwort bestätigen"
        type="password"
        autoComplete="new-password"
        error={errors.confirm?.message}
        {...register("confirm")}
      />

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Speichern…" : "Passwort speichern"}
      </Button>
    </form>
  );
}
