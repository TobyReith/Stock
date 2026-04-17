"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Server actions that back the `/settings` push-toggle.
 *
 * Design choices:
 * - **Upsert on `endpoint`.** Browsers sometimes re-issue a subscription
 *   with the same endpoint (e.g. after a push service rotation); a plain
 *   insert would throw a unique-constraint violation. Upsert keeps one
 *   row per physical subscription and also handles the "same device,
 *   different account" hand-off because the endpoint is the natural key.
 * - **User-scoped deletes.** The client sends an endpoint string, but we
 *   always AND with `user_id = auth.uid()` so a user can't wipe another
 *   user's subscription even if they guess the endpoint.
 */

const subscriptionSchema = z.object({
  endpoint: z.string().url("Endpoint ist keine gültige URL"),
  keys: z.object({
    p256dh: z.string().min(1, "p256dh fehlt"),
    auth: z.string().min(1, "auth fehlt"),
  }),
});

export type SubscriptionInput = z.infer<typeof subscriptionSchema>;

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

export async function savePushSubscription(
  input: SubscriptionInput,
): Promise<ActionResult> {
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Ungültige Subscription");
  }
  const v = parsed.data;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("Nicht angemeldet");

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint: v.endpoint,
        keys: v.keys,
      },
      { onConflict: "endpoint" },
    );
    if (error) return fail(error.message);

    revalidatePath("/settings");
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unbekannter Fehler");
  }
}

export async function deletePushSubscription(
  endpoint: string,
): Promise<ActionResult> {
  if (typeof endpoint !== "string" || endpoint.length === 0) {
    return fail("Endpoint fehlt");
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("Nicht angemeldet");

    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", endpoint)
      .eq("user_id", user.id);
    if (error) return fail(error.message);

    revalidatePath("/settings");
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unbekannter Fehler");
  }
}
