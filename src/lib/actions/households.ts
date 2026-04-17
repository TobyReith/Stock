import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Returns the user's active household ID, creating one on first use.
 *
 * Phase 1 invariant: each user has exactly one default household
 * ("Mein Haushalt"). Multi-household / invites land in Phase 2.
 *
 * Relies on the RLS policies from migration 20260416184000:
 *   - `households.created_by = auth.uid()` allows insert
 *   - `household_members` allows the creator to bootstrap themselves as owner
 */
export async function ensureHousehold(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string> {
  // Existing membership? Take the first one.
  const { data: membership, error: memErr } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (memErr) throw new Error(`Mitgliedschaft prüfen: ${memErr.message}`);
  if (membership) return membership.household_id;

  // Bootstrap: create household, then join as owner.
  const { data: household, error: hhErr } = await supabase
    .from("households")
    .insert({ name: "Mein Haushalt", created_by: userId })
    .select("id")
    .single();
  if (hhErr || !household) {
    throw new Error(`Haushalt anlegen: ${hhErr?.message ?? "unbekannt"}`);
  }

  const { error: joinErr } = await supabase
    .from("household_members")
    .insert({ household_id: household.id, user_id: userId, role: "owner" });
  if (joinErr) {
    throw new Error(`Mitgliedschaft anlegen: ${joinErr.message}`);
  }

  return household.id;
}
