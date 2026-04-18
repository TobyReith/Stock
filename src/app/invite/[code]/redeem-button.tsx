"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { redeemInvite } from "@/lib/actions/invites";

type Props = {
  code: string;
};

/**
 * Client wrapper around `redeemInvite`. We run from the client so that
 * the error path can surface as a toast without a full page refresh —
 * on success we navigate to `/` and the server components pick up the
 * new active-household cookie that the action just set.
 */
export function RedeemButton({ code }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleRedeem() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await redeemInvite(code);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const message = result.data.alreadyMember
        ? `Du bist bereits Mitglied von ${result.data.householdName}.`
        : `Willkommen bei ${result.data.householdName}.`;
      toast.success(message);
      // The action set the active-household cookie; land on the list so
      // the user sees their new household immediately.
      router.push("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" onClick={handleRedeem} disabled={busy}>
      {busy ? "Trete bei…" : "Haushalt beitreten"}
    </Button>
  );
}
