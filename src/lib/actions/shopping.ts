"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import {
  addShoppingItemSchema,
  shoppingItemIdSchema,
  type AddShoppingItemInput,
} from "@/lib/schemas/shopping";
import {
  ensureActiveHousehold,
  getActiveHouseholdId,
} from "@/lib/households/active";
import { type ActionResult, fail } from "@/lib/actions/result";

type ShoppingUpdate =
  Database["public"]["Tables"]["shopping_list_items"]["Update"];

/**
 * Server actions for the Einkaufsliste.
 *
 * Mirrors `actions/items.ts` structure: validated inputs, explicit
 * active-household scoping (not just RLS) so the multi-household
 * switcher can't leak writes across households, and a shared
 * `ActionResult` shape so call sites stay boring.
 */

/**
 * Add an item to the shopping list. Two entry paths:
 *
 *   - **Freitext** (most common): `customName` only — "Bananen".
 *   - **Vom Vorrat-Detail**: `productId` + optional `customName` / qty —
 *     we keep the product reference so "Gekauft → zum Vorrat" can
 *     pre-fill with the exact same product.
 *
 * Returns the new row's id so optimistic UIs can swap in a real id
 * after the round-trip.
 */
export async function addShoppingItem(
  input: AddShoppingItemInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = addShoppingItemSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const v = parsed.data;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("Nicht angemeldet");

    const householdId = await ensureActiveHousehold(supabase, user.id);

    const { data, error } = await supabase
      .from("shopping_list_items")
      .insert({
        household_id: householdId,
        product_id: v.productId ?? null,
        custom_name: v.customName ?? null,
        brand: v.brand ?? null,
        image_url: v.imageUrl ?? null,
        quantity: v.quantity ?? null,
        unit: v.unit ?? null,
        note: v.note ?? null,
        added_by: user.id,
      })
      .select("id")
      .single();
    if (error || !data) {
      return fail(error?.message ?? "Einkaufsliste: Einfügen fehlgeschlagen");
    }

    revalidatePath("/shopping");
    return { ok: true, data: { id: data.id } };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unbekannter Fehler");
  }
}

/**
 * Toggle the `bought_at` flag on a shopping-list entry.
 *
 * - "not bought → bought"  sets the timestamp to `now()`
 * - "bought → not bought"  clears it (oops-recovery without a dedicated undo toast)
 *
 * The server-side toggle is the source of truth. Clients that want
 * optimistic UI compute the same flip locally and reconcile on return.
 */
export async function toggleShoppingItemBought(
  id: string,
): Promise<ActionResult<{ boughtAt: string | null }>> {
  const parsed = shoppingItemIdSchema.safeParse(id);
  if (!parsed.success) return fail("Ungültige ID");

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("Nicht angemeldet");

    const activeHouseholdId = await getActiveHouseholdId(supabase, user.id);
    if (!activeHouseholdId) return fail("Kein aktiver Haushalt");

    const { data: current, error: readErr } = await supabase
      .from("shopping_list_items")
      .select("bought_at")
      .eq("id", parsed.data)
      .eq("household_id", activeHouseholdId)
      .maybeSingle();
    if (readErr) return fail(readErr.message);
    if (!current) return fail("Eintrag nicht gefunden");

    const nextBoughtAt = current.bought_at ? null : new Date().toISOString();
    const patch: ShoppingUpdate = { bought_at: nextBoughtAt };

    const { error: writeErr } = await supabase
      .from("shopping_list_items")
      .update(patch)
      .eq("id", parsed.data)
      .eq("household_id", activeHouseholdId);
    if (writeErr) return fail(writeErr.message);

    revalidatePath("/shopping");
    return { ok: true, data: { boughtAt: nextBoughtAt } };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unbekannter Fehler");
  }
}

/**
 * Explicit "mark bought" (no toggle) — used by the "Gekauft → zum
 * Vorrat" handover. The Add-Flow calls this on successful insert to
 * close out the shopping-list row without a separate user action.
 *
 * Idempotent: re-calling with an already-bought row is a no-op. We
 * deliberately don't overwrite a previously-set `bought_at` — the
 * original timestamp is the audit-correct one for the history section.
 */
export async function markShoppingItemBought(
  id: string,
): Promise<ActionResult> {
  const parsed = shoppingItemIdSchema.safeParse(id);
  if (!parsed.success) return fail("Ungültige ID");

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("Nicht angemeldet");

    const activeHouseholdId = await getActiveHouseholdId(supabase, user.id);
    if (!activeHouseholdId) return fail("Kein aktiver Haushalt");

    const { error } = await supabase
      .from("shopping_list_items")
      .update({ bought_at: new Date().toISOString() })
      .eq("id", parsed.data)
      .eq("household_id", activeHouseholdId)
      .is("bought_at", null);
    if (error) return fail(error.message);

    revalidatePath("/shopping");
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unbekannter Fehler");
  }
}

/**
 * Update the quantity on a shopping-list entry.
 * Pass `null` to clear the quantity ("keine Angabe").
 */
export async function updateShoppingItemQuantity(
  id: string,
  quantity: number | null,
): Promise<ActionResult> {
  const parsedId = shoppingItemIdSchema.safeParse(id);
  if (!parsedId.success) return fail("Ungültige ID");
  if (quantity !== null && (typeof quantity !== "number" || quantity <= 0)) {
    return fail("Menge muss > 0 sein");
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("Nicht angemeldet");

    const activeHouseholdId = await getActiveHouseholdId(supabase, user.id);
    if (!activeHouseholdId) return fail("Kein aktiver Haushalt");

    const { error } = await supabase
      .from("shopping_list_items")
      .update({ quantity })
      .eq("id", parsedId.data)
      .eq("household_id", activeHouseholdId);
    if (error) return fail(error.message);

    revalidatePath("/shopping");
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unbekannter Fehler");
  }
}

/**
 * Mark all open shopping-list entries as bought in one go.
 * Returns the number of rows updated.
 */
export async function markAllShoppingItemsBought(): Promise<
  ActionResult<{ count: number }>
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("Nicht angemeldet");

    const activeHouseholdId = await getActiveHouseholdId(supabase, user.id);
    if (!activeHouseholdId) return fail("Kein aktiver Haushalt");

    const { data, error } = await supabase
      .from("shopping_list_items")
      .update({ bought_at: new Date().toISOString() })
      .eq("household_id", activeHouseholdId)
      .is("bought_at", null)
      .select("id");
    if (error) return fail(error.message);

    revalidatePath("/shopping");
    return { ok: true, data: { count: data?.length ?? 0 } };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unbekannter Fehler");
  }
}

/**
 * Patch editable fields on a shopping-list entry.
 * Only fields present (not `undefined`) in `patch` are written.
 */
export async function updateShoppingItemDetails(
  id: string,
  patch: {
    customName?: string | null;
    quantity?: number | null;
    unit?: string | null;
    note?: string | null;
  },
): Promise<ActionResult> {
  const parsedId = shoppingItemIdSchema.safeParse(id);
  if (!parsedId.success) return fail("Ungültige ID");

  if (
    patch.customName !== undefined &&
    (patch.customName === null || patch.customName.trim().length === 0)
  ) {
    return fail("Bezeichnung darf nicht leer sein");
  }
  if (
    patch.quantity !== undefined &&
    patch.quantity !== null &&
    patch.quantity <= 0
  ) {
    return fail("Menge muss > 0 sein");
  }

  const update: ShoppingUpdate = {};
  if (patch.customName !== undefined)
    update.custom_name = patch.customName?.trim() ?? null;
  if (patch.quantity !== undefined) update.quantity = patch.quantity;
  if (patch.unit !== undefined) update.unit = patch.unit?.trim() || null;
  if (patch.note !== undefined) update.note = patch.note?.trim() || null;

  if (Object.keys(update).length === 0) {
    return { ok: true, data: undefined };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("Nicht angemeldet");

    const activeHouseholdId = await getActiveHouseholdId(supabase, user.id);
    if (!activeHouseholdId) return fail("Kein aktiver Haushalt");

    const { error } = await supabase
      .from("shopping_list_items")
      .update(update)
      .eq("id", parsedId.data)
      .eq("household_id", activeHouseholdId);
    if (error) return fail(error.message);

    revalidatePath("/shopping");
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unbekannter Fehler");
  }
}

/**
 * Hard-delete a shopping-list entry. Used when the user adds
 * something by mistake, or cleans up historical "bought" rows.
 *
 * We don't soft-delete — unlike `items`, shopping-list rows have no
 * downstream stats that would care about a tombstone.
 */
export async function deleteShoppingItem(
  id: string,
): Promise<ActionResult> {
  const parsed = shoppingItemIdSchema.safeParse(id);
  if (!parsed.success) return fail("Ungültige ID");

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("Nicht angemeldet");

    const activeHouseholdId = await getActiveHouseholdId(supabase, user.id);
    if (!activeHouseholdId) return fail("Kein aktiver Haushalt");

    const { error } = await supabase
      .from("shopping_list_items")
      .delete()
      .eq("id", parsed.data)
      .eq("household_id", activeHouseholdId);
    if (error) return fail(error.message);

    revalidatePath("/shopping");
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unbekannter Fehler");
  }
}
