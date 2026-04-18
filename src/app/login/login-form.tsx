"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  email: z.string().email("Bitte gültige E-Mail eingeben"),
});
type FormValues = z.infer<typeof schema>;

// Only allow same-origin relative paths so a hostile `?next=` can't
// redirect users off-site. `/auth/callback` already re-validates the
// `next` it receives, but belt-and-suspenders.
function safeNext(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export function LoginForm() {
  const [sent, setSent] = useState(false);
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit({ email }: FormValues) {
    const supabase = createClient();
    const callback = new URL("/auth/callback", window.location.origin);
    if (next !== "/") callback.searchParams.set("next", next);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: callback.toString(),
      },
    });
    if (error) {
      toast.error("Konnte Magic Link nicht senden", { description: error.message });
      return;
    }
    setSent(true);
    toast.success("Magic Link versendet — schau in dein Postfach.");
  }

  if (sent) {
    return (
      <div className="rounded-md border p-4 text-sm text-muted-foreground">
        Wir haben dir einen Anmelde-Link geschickt. Klicke den Link in der E-Mail,
        um dich einzuloggen. Du kannst dieses Fenster schließen.
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
        {isSubmitting ? "Wird gesendet…" : "Magic Link senden"}
      </Button>
    </form>
  );
}
