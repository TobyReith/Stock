"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import {
  updateProfileSchema,
  type UpdateProfileInput,
} from "@/lib/schemas/auth";
import { updateProfile } from "@/lib/actions/auth";

type Props = {
  initialName: string;
  email: string;
};

/**
 * Profile editor — for now just the display name. Email is read-only
 * (changing it needs a verification flow we don't have yet) so we
 * render it as a disabled input to make the "this is you" context
 * explicit without inviting edits.
 */
export function ProfileForm({ initialName, email }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { name: initialName },
  });

  function onSubmit(values: UpdateProfileInput) {
    startTransition(async () => {
      const result = await updateProfile(values);
      if (!result.ok) {
        toast.error("Name nicht gespeichert", { description: result.error });
        return;
      }
      toast.success("Name gespeichert.");
      // Reset dirty state so the button goes quiet until the next edit.
      reset({ name: values.name });
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <FormField
        id="profile-name"
        label="Name"
        type="text"
        autoComplete="name"
        error={errors.name?.message}
        {...register("name")}
      />

      <FormField
        id="profile-email"
        label="E-Mail"
        type="email"
        value={email}
        disabled
        readOnly
      />

      <Button type="submit" disabled={!isDirty || pending}>
        {pending ? "Speichern…" : "Speichern"}
      </Button>
    </form>
  );
}
