import "server-only";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "./server";

/**
 * Get the currently authenticated user — memoized per request.
 *
 * Every Server Component in `(app)/` needs to know who the user is,
 * and without this helper each page makes its own `supabase.auth.
 * getUser()` call. Even though `@supabase/ssr` backs that with cookie
 * reads rather than a full network round-trip, the repeated work adds
 * up on a tab switch: layout + page + `getActiveHouseholdId` helper
 * would all re-derive the user independently.
 *
 * React `cache()` dedupes across a single render tree. Callers get the
 * same `User` (or `null`) reference whether they're in the layout,
 * a page, or a shared server util.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
