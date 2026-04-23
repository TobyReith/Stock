import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/session";
import { getActiveHouseholdId } from "@/lib/households/active";
import { buttonVariants } from "@/components/ui/button";
import { StorageLocationsManager } from "./storage-locations-manager";
import type { StorageLocationDisplay } from "@/lib/schemas/storage-locations";

export const metadata = { title: "Lagerorte verwalten" };

export default async function LagerorteSettingsPage() {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  if (!user) return null;

  const householdId = await getActiveHouseholdId(supabase, user.id);
  const locations: StorageLocationDisplay[] = householdId
    ? await loadStorageLocations(supabase, householdId)
    : [];

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <header className="mb-6 flex items-center gap-2">
        <Link
          href="/settings"
          className={buttonVariants({ variant: "ghost", size: "icon" })}
          aria-label="Zurück"
        >
          <ArrowLeft aria-hidden />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Lagerorte</h1>
          <p className="text-sm text-muted-foreground">
            Anlegen, umbenennen, sortieren.
          </p>
        </div>
      </header>

      <StorageLocationsManager initialLocations={locations} />
    </div>
  );
}

async function loadStorageLocations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  householdId: string,
): Promise<StorageLocationDisplay[]> {
  const { data } = await supabase
    .from("storage_locations")
    .select("id, name, icon, slug, sort_order, is_system, temperature_hint")
    .eq("household_id", householdId)
    .order("sort_order", { ascending: true });
  return (data ?? []).map((l) => ({
    id: l.id,
    slug: l.slug,
    name: l.name,
    icon: l.icon,
    sortOrder: l.sort_order,
    isSystem: l.is_system,
    temperatureHint: l.temperature_hint as StorageLocationDisplay["temperatureHint"],
  }));
}
