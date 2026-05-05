import Link from "next/link";
import { Settings } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/session";
import { createClient } from "@/lib/supabase/server";
import { getActiveHouseholdId, listMemberships } from "@/lib/households/active";
import { HouseholdSwitcher } from "@/app/(app)/_header/household-switcher";
import { buttonVariants } from "@/components/ui/button";

export async function TopBar() {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  if (!user) return null;

  const [activeHouseholdId, memberships] = await Promise.all([
    getActiveHouseholdId(supabase, user.id),
    listMemberships(supabase, user.id),
  ]);

  return (
    <header className="fixed inset-x-0 top-0 z-40 h-11 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-full max-w-md items-center justify-between px-4">
        <HouseholdSwitcher memberships={memberships} activeId={activeHouseholdId} />
        <Link
          href="/settings"
          aria-label="Einstellungen"
          className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
        >
          <Settings className="size-4" aria-hidden />
        </Link>
      </div>
    </header>
  );
}
