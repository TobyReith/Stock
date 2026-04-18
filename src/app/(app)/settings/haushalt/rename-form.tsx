"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { renameHousehold } from "@/lib/actions/households";

type Props = {
  householdId: string;
  currentName: string;
};

/**
 * Owner-only inline rename.
 *
 * Two visual modes:
 *   - Read: shows the name + a pencil affordance.
 *   - Edit: input + save/cancel. Save is server-validated (1–80 chars,
 *     trimmed); we mirror the client-side `required`/`maxLength` hints
 *     for a snappier feel but don't treat them as the source of truth.
 *
 * We don't maintain an optimistic name here — the server action
 * revalidates `/settings/haushalt` and `/`, and `router.refresh()` isn't
 * needed because `revalidatePath` already queues the RSC re-render.
 */
export function RenameForm({ householdId, currentName }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentName);
  const [pending, startTransition] = useTransition();

  function startEdit() {
    setValue(currentName);
    setEditing(true);
  }

  function cancel() {
    setValue(currentName);
    setEditing(false);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed === currentName) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      const result = await renameHousehold(householdId, trimmed);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Haushalt umbenannt.");
      setEditing(false);
    });
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{currentName}</p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`„${currentName}” umbenennen`}
          onClick={startEdit}
        >
          <Pencil aria-hidden />
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <Label htmlFor="household-name" className="sr-only">
        Haushaltsname
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id="household-name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={80}
          required
          autoFocus
          disabled={pending}
        />
        <Button
          type="submit"
          variant="default"
          size="icon-sm"
          aria-label="Speichern"
          disabled={pending || value.trim().length === 0}
        >
          <Check aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Abbrechen"
          onClick={cancel}
          disabled={pending}
        >
          <X aria-hidden />
        </Button>
      </div>
    </form>
  );
}
