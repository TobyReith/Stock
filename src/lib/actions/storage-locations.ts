"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActiveHouseholdId } from "@/lib/households/active";
import {
  createStorageLocationSchema,
  updateStorageLocationSchema,
  setStorageLocationCategoriesSchema,
  type StorageLocationDisplay,
  type ItemCategoryKey,
  type CreateStorageLocationInput,
  type UpdateStorageLocationInput,
  type SetStorageLocationCategoriesInput,
} from "@/lib/schemas/storage-locations";
import { type ActionResult, fail } from "@/lib/actions/result";
import type { Database } from "@/lib/supabase/database.types";

type StorageLocationUpdate = Database["public"]["Tables"]["storage_locations"]["Update"];

type RawStorageLocation = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  sort_order: number;
  is_system: boolean;
  temperature_hint: string;
  storage_location_categories: Array<{ category: string }> | null;
};

function mapStorageLocation(l: RawStorageLocation): StorageLocationDisplay {
  return {
    id: l.id,
    slug: l.slug,
    name: l.name,
    icon: l.icon,
    sortOrder: l.sort_order,
    isSystem: l.is_system,
    temperatureHint: l.temperature_hint as StorageLocationDisplay["temperatureHint"],
    categories: (l.storage_location_categories ?? []).map(
      (c) => c.category as ItemCategoryKey,
    ),
  };
}

export async function listStorageLocations(): Promise<ActionResult<StorageLocationDisplay[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("Nicht angemeldet");

  const householdId = await getActiveHouseholdId(supabase, user.id);
  if (!householdId) return fail("Kein aktiver Haushalt");

  const { data, error } = await supabase
    .from("storage_locations")
    .select("id, name, icon, slug, sort_order, is_system, temperature_hint, storage_location_categories(category)")
    .eq("household_id", householdId)
    .order("sort_order", { ascending: true });

  if (error) return fail(error.message);

  return {
    ok: true,
    data: (data ?? []).map((l) => mapStorageLocation(l)),
  };
}

export async function createStorageLocation(
  input: CreateStorageLocationInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createStorageLocationSchema.safeParse(input);
  if (!parsed.success)
    return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const v = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("Nicht angemeldet");

  const householdId = await getActiveHouseholdId(supabase, user.id);
  if (!householdId) return fail("Kein aktiver Haushalt");

  const slug = "loc_" + crypto.randomUUID().replace(/-/g, "").slice(0, 8);

  const { data: maxRow } = await supabase
    .from("storage_locations")
    .select("sort_order")
    .eq("household_id", householdId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sortOrder = (maxRow?.sort_order ?? 0) + 1;

  const { data, error } = await supabase
    .from("storage_locations")
    .insert({
      household_id: householdId,
      name: v.name,
      icon: v.icon,
      slug,
      sort_order: sortOrder,
      is_system: false,
      temperature_hint: v.temperatureHint,
    })
    .select("id")
    .single();

  if (error || !data) return fail(error?.message ?? "Fehler beim Anlegen");

  revalidatePath("/settings/lagerorte");
  revalidatePath("/");
  return { ok: true, data: { id: data.id } };
}

export async function updateStorageLocation(
  input: UpdateStorageLocationInput,
): Promise<ActionResult> {
  const parsed = updateStorageLocationSchema.safeParse(input);
  if (!parsed.success)
    return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const v = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("Nicht angemeldet");

  const householdId = await getActiveHouseholdId(supabase, user.id);
  if (!householdId) return fail("Kein aktiver Haushalt");

  const patch: StorageLocationUpdate = {};
  if (v.name !== undefined) patch.name = v.name;
  if (v.icon !== undefined) patch.icon = v.icon;
  if (v.temperatureHint !== undefined) patch.temperature_hint = v.temperatureHint;
  if (v.sortOrder !== undefined) patch.sort_order = v.sortOrder;
  if (Object.keys(patch).length === 0) return { ok: true, data: undefined };

  const { error } = await supabase
    .from("storage_locations")
    .update(patch)
    .eq("id", v.id)
    .eq("household_id", householdId);

  if (error) return fail(error.message);

  revalidatePath("/settings/lagerorte");
  revalidatePath("/");
  return { ok: true, data: undefined };
}

export async function deleteStorageLocation(
  id: string,
  reassignSlug = "other",
): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return fail("Ungültige ID");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("Nicht angemeldet");

  const householdId = await getActiveHouseholdId(supabase, user.id);
  if (!householdId) return fail("Kein aktiver Haushalt");

  const { data: loc } = await supabase
    .from("storage_locations")
    .select("id, slug, is_system")
    .eq("id", id)
    .eq("household_id", householdId)
    .maybeSingle();

  if (!loc) return fail("Lagerort nicht gefunden");
  if (loc.is_system) return fail("System-Lagerorte können nicht gelöscht werden");

  const { error: updateErr } = await supabase
    .from("items")
    .update({ location: reassignSlug })
    .eq("household_id", householdId)
    .eq("location", loc.slug);

  if (updateErr) return fail(updateErr.message);

  const { error: deleteErr } = await supabase
    .from("storage_locations")
    .delete()
    .eq("id", id)
    .eq("household_id", householdId);

  if (deleteErr) return fail(deleteErr.message);

  revalidatePath("/settings/lagerorte");
  revalidatePath("/");
  return { ok: true, data: undefined };
}

export async function reorderStorageLocations(
  orderedIds: string[],
): Promise<ActionResult> {
  const uuidSchema = z.string().uuid();
  if (!orderedIds.every((id) => uuidSchema.safeParse(id).success))
    return fail("Ungültige IDs");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("Nicht angemeldet");

  const householdId = await getActiveHouseholdId(supabase, user.id);
  if (!householdId) return fail("Kein aktiver Haushalt");

  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase
        .from("storage_locations")
        .update({ sort_order: index + 1 })
        .eq("id", id)
        .eq("household_id", householdId),
    ),
  );

  const firstErr = results.find((r) => r.error);
  if (firstErr?.error) return fail(firstErr.error.message);

  revalidatePath("/settings/lagerorte");
  revalidatePath("/");
  return { ok: true, data: undefined };
}

export async function setStorageLocationCategories(
  input: SetStorageLocationCategoriesInput,
): Promise<ActionResult> {
  const parsed = setStorageLocationCategoriesSchema.safeParse(input);
  if (!parsed.success)
    return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const v = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("Nicht angemeldet");

  const householdId = await getActiveHouseholdId(supabase, user.id);
  if (!householdId) return fail("Kein aktiver Haushalt");

  const { data: loc } = await supabase
    .from("storage_locations")
    .select("id")
    .eq("id", v.storageLocationId)
    .eq("household_id", householdId)
    .maybeSingle();

  if (!loc) return fail("Lagerort nicht gefunden");

  const { error: delErr } = await supabase
    .from("storage_location_categories")
    .delete()
    .eq("storage_location_id", v.storageLocationId);

  if (delErr) return fail(delErr.message);

  if (v.categories.length > 0) {
    const { error: insErr } = await supabase
      .from("storage_location_categories")
      .insert(
        v.categories.map((category) => ({
          storage_location_id: v.storageLocationId,
          category,
        })),
      );
    if (insErr) return fail(insErr.message);
  }

  revalidatePath("/settings/lagerorte");
  revalidatePath("/");
  return { ok: true, data: undefined };
}

export async function countItemsByStorageLocation(
  slug: string,
): Promise<ActionResult<number>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("Nicht angemeldet");

  const householdId = await getActiveHouseholdId(supabase, user.id);
  if (!householdId) return fail("Kein aktiver Haushalt");

  const { count, error } = await supabase
    .from("items")
    .select("id", { count: "exact", head: true })
    .eq("household_id", householdId)
    .eq("location", slug)
    .is("consumed_at", null)
    .is("discarded_at", null);

  if (error) return fail(error.message);
  return { ok: true, data: count ?? 0 };
}
