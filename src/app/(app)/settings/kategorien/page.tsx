import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/session";
import { getActiveHouseholdId } from "@/lib/households/active";
import { buttonVariants } from "@/components/ui/button";
import { CategoriesManager } from "./categories-manager";
import type { CategoryDisplay } from "@/lib/schemas/categories";

export const metadata = { title: "Kategorien verwalten" };

export default async function KategorienPage() {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  if (!user) return null;

  const householdId = await getActiveHouseholdId(supabase, user.id);
  const categories: CategoryDisplay[] = householdId
    ? await loadCategories(supabase, householdId)
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
          <h1 className="font-serif text-[26px] font-medium tracking-tight">Kategorien</h1>
          <p className="text-sm text-muted">
            Anlegen, umbenennen, sortieren.
          </p>
        </div>
      </header>

      <CategoriesManager initialCategories={categories} />
    </div>
  );
}

async function loadCategories(
  supabase: Awaited<ReturnType<typeof createClient>>,
  householdId: string,
): Promise<CategoryDisplay[]> {
  const { data } = await supabase
    .from("categories")
    .select("id, name, icon, color, sort_order, is_system, slug")
    .eq("household_id", householdId)
    .order("sort_order", { ascending: true });
  return (data ?? []).map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    icon: c.icon,
    color: c.color,
    sortOrder: c.sort_order,
    isSystem: c.is_system,
  }));
}
