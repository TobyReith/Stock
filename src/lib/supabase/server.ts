import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/**
 * Server-side Supabase client, memoized per request.
 *
 * We wrap the factory with React's `cache()` so every Server Component
 * and helper that awaits `createClient()` within a single render shares
 * one underlying client instance. Without this dedup, each `page.tsx`
 * would construct its own client (and repeat the cookie read +
 * `auth.getUser()` RTT) even though the layout already did it.
 *
 * Cache scope is per-request — it does **not** persist across
 * navigations. That's what we want: the next Server render starts fresh
 * so cookie updates from server actions propagate.
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — Middleware will refresh the session.
          }
        },
      },
    },
  );
});
