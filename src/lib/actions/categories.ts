"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActiveHouseholdId } from "@/lib/households/active";
import {
  createCategorySchema,
  updateCategorySchema,
  type CategoryDisplay,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from "@/lib/schemas/categories";
import { type ActionResult, fail } from "@/lib/actions/result";
import type { Database } from "@/lib/supabase/database.types";

type CategoryUpdate = Database["public"]["Tables"]["categories"]["Update"];

/**
 * Load all categories for the active household, sorted by sort_order.
 * Called from server components; also usable as a server action from client
 * components that need a fresh fetch.
 */
export async function listCategories(): Promise<ActionResult<CategoryDisplay[]>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Nicht angemeldet");

  const householdId = await getActiveHouseholdId(supabase, user.id);
  if (!householdId) return fail("Kein aktiver Haushalt");

  const { data, error } = await supabase
    .from("categories")
    .select("id, name, icon, color, sort_order, is_system, slug, parent_category")
    .eq("household_id", householdId)
    .order("sort_order", { ascending: true });

  if (error) return fail(error.message);

  return {
    ok: true,
    data: (data ?? []).map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      icon: c.icon,
      color: c.color,
      sortOrder: c.sort_order,
      isSystem: c.is_system,
      parentCategory: c.parent_category,
    })),
  };
}

export async function createCategory(
  input: CreateCategoryInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createCategorySchema.safeParse(input);
  if (!parsed.success)
    return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const v = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Nicht angemeldet");

  const householdId = await getActiveHouseholdId(supabase, user.id);
  if (!householdId) return fail("Kein aktiver Haushalt");

  // Generate a stable, short slug for the custom category
  const slug =
    "custom_" + crypto.randomUUID().replace(/-/g, "").slice(0, 8);

  // Place new category after all existing ones
  const { data: maxRow } = await supabase
    .from("categories")
    .select("sort_order")
    .eq("household_id", householdId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sortOrder = (maxRow?.sort_order ?? 0) + 1;

  const { data, error } = await supabase
    .from("categories")
    .insert({
      household_id: householdId,
      name: v.name,
      icon: v.icon,
      color: v.color,
      sort_order: sortOrder,
      is_system: false,
      slug,
      parent_category: v.parentCategory,
    })
    .select("id")
    .single();

  if (error || !data) return fail(error?.message ?? "Fehler beim Anlegen");

  revalidatePath("/settings/kategorien");
  revalidatePath("/");
  return { ok: true, data: { id: data.id } };
}

export async function updateCategory(
  input: UpdateCategoryInput,
): Promise<ActionResult> {
  const parsed = updateCategorySchema.safeParse(input);
  if (!parsed.success)
    return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const v = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Nicht angemeldet");

  const householdId = await getActiveHouseholdId(supabase, user.id);
  if (!householdId) return fail("Kein aktiver Haushalt");

  const patch: CategoryUpdate = {};
  if (v.name !== undefined) patch.name = v.name;
  if (v.icon !== undefined) patch.icon = v.icon;
  if (v.color !== undefined) patch.color = v.color;
  if (v.sortOrder !== undefined) patch.sort_order = v.sortOrder;
  if (Object.keys(patch).length === 0) return { ok: true, data: undefined };

  const { error } = await supabase
    .from("categories")
    .update(patch)
    .eq("id", v.id)
    .eq("household_id", householdId);

  if (error) return fail(error.message);

  revalidatePath("/settings/kategorien");
  revalidatePath("/");
  return { ok: true, data: undefined };
}

/**
 * Delete a custom category. Items using it are moved to `reassignSlug`
 * (defaults to "other"). System categories cannot be deleted.
 */
export async function deleteCategory(
  id: string,
  reassignSlug = "other",
): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return fail("Ungültige ID");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Nicht angemeldet");

  const householdId = await getActiveHouseholdId(supabase, user.id);
  if (!householdId) return fail("Kein aktiver Haushalt");

  const { data: cat } = await supabase
    .from("categories")
    .select("id, slug, is_system")
    .eq("id", id)
    .eq("household_id", householdId)
    .maybeSingle();

  if (!cat) return fail("Kategorie nicht gefunden");
  if (cat.is_system)
    return fail("System-Kategorien können nicht gelöscht werden");

  // Move affected items to the reassign target (null = no custom override = falls through to product category)
  const newCustomCategory = reassignSlug === "other" ? null : reassignSlug;
  const { error: updateErr } = await supabase
    .from("items")
    .update({ custom_category: newCustomCategory })
    .eq("household_id", householdId)
    .eq("custom_category", cat.slug);

  if (updateErr) return fail(updateErr.message);

  const { error: deleteErr } = await supabase
    .from("categories")
    .delete()
    .eq("id", id)
    .eq("household_id", householdId);

  if (deleteErr) return fail(deleteErr.message);

  revalidatePath("/settings/kategorien");
  revalidatePath("/");
  return { ok: true, data: undefined };
}

/**
 * Persist a new sort_order for all categories in one batch.
 * `orderedIds` is the full ordered list of category UUIDs.
 */
export async function reorderCategories(
  orderedIds: string[],
): Promise<ActionResult> {
  const uuidSchema = z.string().uuid();
  if (!orderedIds.every((id) => uuidSchema.safeParse(id).success))
    return fail("Ungültige IDs");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Nicht angemeldet");

  const householdId = await getActiveHouseholdId(supabase, user.id);
  if (!householdId) return fail("Kein aktiver Haushalt");

  // Fire all updates in parallel — Supabase/PostgREST supports concurrent patches
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase
        .from("categories")
        .update({ sort_order: index + 1 })
        .eq("id", id)
        .eq("household_id", householdId),
    ),
  );

  const firstErr = results.find((r) => r.error);
  if (firstErr?.error) return fail(firstErr.error.message);

  revalidatePath("/settings/kategorien");
  revalidatePath("/");
  return { ok: true, data: undefined };
}

/**
 * Count items that use a given category slug (for delete confirmation).
 */
export async function countItemsByCategory(
  slug: string,
): Promise<ActionResult<number>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Nicht angemeldet");

  const householdId = await getActiveHouseholdId(supabase, user.id);
  if (!householdId) return fail("Kein aktiver Haushalt");

  const { count, error } = await supabase
    .from("items")
    .select("id", { count: "exact", head: true })
    .eq("household_id", householdId)
    .eq("custom_category", slug)
    .is("consumed_at", null)
    .is("discarded_at", null);

  if (error) return fail(error.message);
  return { ok: true, data: count ?? 0 };
}
