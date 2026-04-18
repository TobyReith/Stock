"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import {
  fetchProductByBarcode,
  OFFFetchError,
  OFFNotFoundError,
  type OFFProduct,
} from "@/lib/openfoodfacts";
import {
  addItemSchema,
  itemIdSchema,
  updateItemSchema,
  barcodeSchema,
  type AddItemInput,
  type UpdateItemInput,
} from "@/lib/schemas/items";
import {
  ensureActiveHousehold,
  getActiveHouseholdId,
} from "@/lib/households/active";

type ItemUpdate = Database["public"]["Tables"]["items"]["Update"];

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

/**
 * Look up a barcode: prefer our local `products` cache, fall back to the
 * Open Food Facts API. Does NOT write the product row — that happens
 * lazily inside {@link addItem} once the user commits.
 */
export async function lookupBarcode(barcode: string): Promise<
  ActionResult<
    | { source: "cache"; productId: string; product: CachedProduct }
    | { source: "openfoodfacts"; product: OFFProduct }
    | { source: "unknown"; barcode: string }
  >
> {
  const parsed = barcodeSchema.safeParse(barcode);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Ungültiger Barcode");
  const code = parsed.data;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("Nicht angemeldet");

    // 1. Cache hit?
    const { data: cached } = await supabase
      .from("products")
      .select("id, name, brand, category, image_url")
      .eq("barcode", code)
      .maybeSingle();

    if (cached) {
      return {
        ok: true,
        data: {
          source: "cache",
          productId: cached.id,
          product: {
            name: cached.name,
            brand: cached.brand,
            category: cached.category,
            imageUrl: cached.image_url,
          },
        },
      };
    }

    // 2. Open Food Facts.
    try {
      const product = await fetchProductByBarcode(code);
      return { ok: true, data: { source: "openfoodfacts", product } };
    } catch (err) {
      if (err instanceof OFFNotFoundError) {
        return { ok: true, data: { source: "unknown", barcode: code } };
      }
      if (err instanceof OFFFetchError) {
        return fail(err.message);
      }
      throw err;
    }
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unbekannter Fehler");
  }
}

type CachedProduct = {
  name: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
};

/**
 * Add a new item to the user's household. Resolves or creates the
 * underlying product first, then inserts the item.
 */
export async function addItem(input: AddItemInput): Promise<ActionResult<{ itemId: string }>> {
  const parsed = addItemSchema.safeParse(input);
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

    // Resolve product: either provided, looked up by barcode, or created fresh.
    let productId = v.productId ?? null;

    if (!productId && v.barcode) {
      const { data: existing } = await supabase
        .from("products")
        .select("id")
        .eq("barcode", v.barcode)
        .maybeSingle();
      productId = existing?.id ?? null;
    }

    if (!productId) {
      // Create product via service_role — `products` writes are admin-only
      // by design (ADR-0002). Source heuristic: if we have a barcode, the
      // user came from a scan path; otherwise it's a manual entry.
      const admin = createAdminClient();
      const { data: created, error: createErr } = await admin
        .from("products")
        .insert({
          barcode: v.barcode ?? null,
          name: v.productName ?? "Unbekannt",
          brand: v.brand ?? null,
          category: v.category ?? null,
          image_url: v.imageUrl ?? null,
          source: v.barcode ? "openfoodfacts" : "manual",
        })
        .select("id")
        .single();
      if (createErr || !created) {
        return fail(`Produkt nicht angelegt: ${createErr?.message ?? "unbekannt"}`);
      }
      productId = created.id;
    }

    // Insert the item under the user's household. RLS allows it because
    // the user is a member and `added_by = auth.uid()`.
    const { data: item, error: itemErr } = await supabase
      .from("items")
      .insert({
        household_id: householdId,
        product_id: productId,
        custom_name: v.customName ?? null,
        quantity: v.quantity,
        unit: v.unit ?? null,
        best_before: v.bestBefore,
        location: v.location,
        note: v.note ?? null,
        added_by: user.id,
      })
      .select("id")
      .single();
    if (itemErr || !item) {
      return fail(`Artikel nicht angelegt: ${itemErr?.message ?? "unbekannt"}`);
    }

    revalidatePath("/");
    return { ok: true, data: { itemId: item.id } };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unbekannter Fehler");
  }
}

export async function updateItem(input: UpdateItemInput): Promise<ActionResult> {
  const parsed = updateItemSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
  const v = parsed.data;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("Nicht angemeldet");

    const patch: ItemUpdate = {};
    if (v.customName !== undefined) patch.custom_name = v.customName;
    if (v.quantity !== undefined) patch.quantity = v.quantity;
    if (v.unit !== undefined) patch.unit = v.unit;
    if (v.bestBefore !== undefined) patch.best_before = v.bestBefore;
    if (v.location !== undefined) patch.location = v.location;
    if (v.note !== undefined) patch.note = v.note;
    if (Object.keys(patch).length === 0) return { ok: true, data: undefined };

    // Scope the update to the active household. RLS already blocks
    // non-members, but once a user belongs to multiple households we
    // want edits to only affect the one currently shown in the UI —
    // otherwise a stale client-side item id from household B could leak
    // an edit through while the user thinks they're in household A.
    const activeHouseholdId = await getActiveHouseholdId(supabase, user.id);
    if (!activeHouseholdId) return fail("Kein aktiver Haushalt");

    const { error } = await supabase
      .from("items")
      .update(patch)
      .eq("id", v.id)
      .eq("household_id", activeHouseholdId);
    if (error) return fail(error.message);

    revalidatePath("/");
    revalidatePath(`/item/${v.id}`);
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unbekannter Fehler");
  }
}

async function markItem(
  itemId: string,
  field: "consumed_at" | "discarded_at",
): Promise<ActionResult> {
  const id = itemIdSchema.safeParse(itemId);
  if (!id.success) return fail("Ungültige Item-ID");

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("Nicht angemeldet");

    // See `updateItem` for why we AND with the active household id.
    const activeHouseholdId = await getActiveHouseholdId(supabase, user.id);
    if (!activeHouseholdId) return fail("Kein aktiver Haushalt");

    const patch: ItemUpdate = { [field]: new Date().toISOString() };
    const { error } = await supabase
      .from("items")
      .update(patch)
      .eq("id", id.data)
      .eq("household_id", activeHouseholdId);
    if (error) return fail(error.message);

    revalidatePath("/");
    revalidatePath("/stats");
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unbekannter Fehler");
  }
}

/** Mark an item as consumed (eaten / used up). */
export async function consumeItem(itemId: string): Promise<ActionResult> {
  return markItem(itemId, "consumed_at");
}

/** Mark an item as discarded (thrown away — feeds the waste stat). */
export async function discardItem(itemId: string): Promise<ActionResult> {
  return markItem(itemId, "discarded_at");
}
