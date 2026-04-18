"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth";

/**
 * Sign-out trigger. No confirm dialog — signing out is cheap and
 * reversible (magic link goes to the same inbox). Pending state blocks
 * double-clicks; on success we hard-push to `/login` and refresh so the
 * app shell re-evaluates the auth gate.
 */
export function LogoutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await signOut();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleClick}
      disabled={pending}
    >
      <LogOut aria-hidden /> {pending ? "Abmelden…" : "Abmelden"}
    </Button>
  );
}
