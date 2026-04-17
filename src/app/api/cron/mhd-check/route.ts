import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { daysUntil } from "@/lib/date";
import {
  buildNotification,
  type ExpiringItem,
} from "@/lib/push/build-notification";
import { sendPush, type StoredSubscription } from "@/lib/push/web-push";

/**
 * Daily MHD push cron.
 *
 * Triggered by Vercel Cron (see `vercel.json`) with
 * `Authorization: Bearer ${CRON_SECRET}`. We enforce that header before
 * touching the DB — a bare GET to this route from the open web gets a
 * 401 and never learns how many subscriptions exist.
 *
 * Flow:
 *   1. Auth the request.
 *   2. Fetch every subscription + its owner's household memberships.
 *   3. Fetch every active item in those households where
 *      `best_before <= today + HORIZON_DAYS`.
 *   4. Group items per user (users with multiple households — Phase 2.2 —
 *      get one merged reminder).
 *   5. Build one payload per user via `buildNotification` (which returns
 *      null when there's nothing worth pinging about).
 *   6. Send; on 410/404 the endpoint is gone, delete the row.
 *
 * Uses the admin (service_role) client throughout because the cron acts
 * across users and the bearer token is the trust boundary.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HORIZON_DAYS = 3;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Fail loudly at request time rather than silently no-oping — a
    // production deploy without CRON_SECRET is a misconfig we want to
    // see in the logs.
    return new Response("CRON_SECRET fehlt", { status: 500 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();

  const { data: subs, error: subsErr } = await admin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, keys");
  if (subsErr) {
    return Response.json(
      { ok: false, error: subsErr.message },
      { status: 500 },
    );
  }
  if (!subs || subs.length === 0) {
    return Response.json({ ok: true, users: 0, sent: 0, deleted: 0, failed: 0 });
  }

  type SubRow = (typeof subs)[number];
  const subsByUser = new Map<string, SubRow[]>();
  for (const sub of subs) {
    const arr = subsByUser.get(sub.user_id) ?? [];
    arr.push(sub);
    subsByUser.set(sub.user_id, arr);
  }
  const userIds = [...subsByUser.keys()];

  const { data: memberships, error: memErr } = await admin
    .from("household_members")
    .select("user_id, household_id")
    .in("user_id", userIds);
  if (memErr) {
    return Response.json(
      { ok: false, error: memErr.message },
      { status: 500 },
    );
  }

  const householdsByUser = new Map<string, Set<string>>();
  for (const m of memberships ?? []) {
    const set = householdsByUser.get(m.user_id) ?? new Set<string>();
    set.add(m.household_id);
    householdsByUser.set(m.user_id, set);
  }

  const householdIds = new Set<string>();
  for (const set of householdsByUser.values()) {
    for (const id of set) householdIds.add(id);
  }

  if (householdIds.size === 0) {
    return Response.json({
      ok: true,
      users: userIds.length,
      sent: 0,
      deleted: 0,
      failed: 0,
    });
  }

  const now = new Date();
  // Cutoff: today + HORIZON_DAYS, expressed as a YYYY-MM-DD string.
  // `best_before` is a `date` column so string comparison is correct.
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + HORIZON_DAYS);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const { data: rows, error: itemsErr } = await admin
    .from("items")
    .select("id, household_id, custom_name, best_before, product:products(name)")
    .in("household_id", [...householdIds])
    .is("consumed_at", null)
    .is("discarded_at", null)
    .lte("best_before", cutoffIso);
  if (itemsErr) {
    return Response.json(
      { ok: false, error: itemsErr.message },
      { status: 500 },
    );
  }

  const itemsByHousehold = new Map<string, ExpiringItem[]>();
  for (const row of rows ?? []) {
    const name = displayName(row);
    const arr = itemsByHousehold.get(row.household_id) ?? [];
    arr.push({
      id: row.id,
      displayName: name,
      bestBefore: row.best_before,
    });
    itemsByHousehold.set(row.household_id, arr);
  }

  let sent = 0;
  let deleted = 0;
  let failed = 0;
  let notified = 0;

  for (const userId of userIds) {
    const households = householdsByUser.get(userId);
    if (!households || households.size === 0) continue;

    const userItems: ExpiringItem[] = [];
    for (const hId of households) {
      const list = itemsByHousehold.get(hId);
      if (list) userItems.push(...list);
    }
    // Sort most urgent first so the three-item body preview
    // (see `buildNotification`) highlights what's most critical.
    userItems.sort(
      (a, b) => daysUntil(a.bestBefore, now) - daysUntil(b.bestBefore, now),
    );

    const payload = buildNotification({
      items: userItems,
      horizonDays: HORIZON_DAYS,
      now,
    });
    if (!payload) continue;
    notified++;

    for (const sub of subsByUser.get(userId) ?? []) {
      const stored: StoredSubscription = {
        endpoint: sub.endpoint,
        keys: sub.keys as StoredSubscription["keys"],
      };
      const result = await sendPush(stored, payload);
      if (result.ok) {
        sent++;
      } else if (result.reason === "gone") {
        const { error: delErr } = await admin
          .from("push_subscriptions")
          .delete()
          .eq("id", sub.id);
        if (delErr) {
          console.warn("Konnte tote Subscription nicht löschen", {
            id: sub.id,
            error: delErr.message,
          });
        } else {
          deleted++;
        }
      } else {
        failed++;
        console.warn("sendPush fehlgeschlagen", {
          subscriptionId: sub.id,
          statusCode: result.statusCode,
          message: result.message,
        });
      }
    }
  }

  return Response.json({
    ok: true,
    users: userIds.length,
    notified,
    sent,
    deleted,
    failed,
  });
}

/**
 * Resolve the display name for a cron item row. Mirrors the list-page
 * logic (`customName ?? productName ?? "Unbekannt"`) so push copy reads
 * the same as the in-app label.
 *
 * Supabase's typed response models to-one FKs as a single object, but
 * the runtime shape is occasionally an array when PostgREST can't prove
 * cardinality — we handle both to keep TS happy and runtime-safe.
 */
function displayName(row: {
  custom_name: string | null;
  product: { name: string } | { name: string }[] | null;
}): string {
  if (row.custom_name) return row.custom_name;
  const p = row.product;
  if (!p) return "Unbekannt";
  if (Array.isArray(p)) return p[0]?.name ?? "Unbekannt";
  return p.name ?? "Unbekannt";
}
