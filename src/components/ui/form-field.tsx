import * as React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Label + input + (error | hint) with the a11y wiring done once.
 *
 * Every auth/profile form was repeating the same ten-line block and —
 * as a reviewer spotted — forgetting to connect `aria-describedby` to
 * the hint/error `<p>`, so screen readers never heard why a field was
 * invalid. Centralising that here makes the wiring impossible to skip:
 *
 *   - `aria-invalid` tracks `error`.
 *   - `aria-describedby` points at the error node when there's an error,
 *     otherwise at the hint node when there's a hint, otherwise nothing.
 *   - Error wins over hint (same rule the callers were already hand-
 *     rolling with `errors.password ? ... : <hint/>`).
 *
 * The optional `labelAdornment` slot is for trailing label content —
 * the "Passwort vergessen?" link sits next to the password label on the
 * login form without needing a bespoke layout wrapper.
 */
type Props = Omit<React.ComponentProps<"input">, "id"> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  labelAdornment?: React.ReactNode;
};

export function FormField({
  id,
  label,
  error,
  hint,
  labelAdornment,
  ...inputProps
}: Props) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className="space-y-2">
      {labelAdornment ? (
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor={id}>{label}</Label>
          {labelAdornment}
        </div>
      ) : (
        <Label htmlFor={id}>{label}</Label>
      )}
      <Input
        id={id}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        {...inputProps}
      />
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
