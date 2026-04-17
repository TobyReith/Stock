import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * SERVER-ONLY Supabase client using the service_role key.
 * Bypasses Row Level Security entirely — use only for operations
 * that have to ignore RLS by design (e.g. write to the global
 * `products` cache, see ADR-0002).
 *
 * Never import this from a client component or pass results to one
 * unless you have explicitly stripped sensitive fields.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL fehlt");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY fehlt");
  return createSupabaseClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
