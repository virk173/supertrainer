import type { SupabaseClient } from "@supabase/supabase-js";

import { buildWeeklyRecap } from "@/lib/cards/recap";
import { computeClientLens, type LedgerDayRow } from "@/lib/ledger/score";
import { tzDate } from "@/lib/ledger/tz";
import type { Json } from "@supertrainer/db/types";

// Phase 6.5 — the client weekly recap tick (db-injected). On the client's local
// Sunday, assemble the coded recap (score/streak/highlights) and deliver it as an
// assistant-labeled card. Idempotent: skips a client who already got a recap this
// week. Delivery is code; a voice wrap of the insight line is the deferred seam.
// PRODUCTION IDEAL: Sunday-evening pg_cron; the daily Vercel cron fires it on Sundays.

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RecapTickOptions {
  clientIds?: string[];
}

export async function runWeeklyRecapTick(
  db: SupabaseClient,
  now: Date,
  opts: RecapTickOptions = {},
): Promise<{ delivered: number }> {
  let q = db.from("clients").select("id, org_id, profiles:profile_id (timezone)").eq("status", "active");
  if (opts.clientIds) q = q.in("id", opts.clientIds);
  const { data: clients, error } = await q;
  if (error) throw error;

  let delivered = 0;
  const sixDaysAgo = new Date(now.getTime() - 6 * DAY_MS).toISOString();

  for (const c of clients ?? []) {
    const clientId = c.id as string;
    const timezone = (c.profiles as { timezone?: string } | null)?.timezone ?? "UTC";
    const today = tzDate(timezone, now);
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    if (weekday !== 0) continue; // Sunday only

    // Already recapped this week?
    const { count: recent } = await db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("kind", "card")
      .gte("created_at", sixDaysAgo)
      .contains("payload", { recap: true });
    if ((recent ?? 0) > 0) continue;

    const { data: rows } = await db
      .from("ledger_days")
      .select("*")
      .eq("client_id", clientId)
      .order("tz_date", { ascending: false })
      .limit(14);
    if (!rows || rows.length === 0) continue;
    const lens = computeClientLens(rows as unknown as LedgerDayRow[]);

    const [{ count: meals }, { count: weighs }] = await Promise.all([
      db.from("meal_logs").select("id", { count: "exact", head: true }).eq("client_id", clientId).gte("tz_date", tzDate(timezone, new Date(now.getTime() - 7 * DAY_MS))),
      db.from("weigh_ins").select("id", { count: "exact", head: true }).eq("client_id", clientId).gte("tz_date", tzDate(timezone, new Date(now.getTime() - 7 * DAY_MS))),
    ]);

    const recap = buildWeeklyRecap({
      score: lens.score,
      band: lens.band.band,
      streak: lens.streak,
      mealsLogged: meals ?? 0,
      weighIns: weighs ?? 0,
      nextDayType: null,
    });

    await db.from("messages").insert({
      org_id: c.org_id,
      client_id: clientId,
      sender: "assistant",
      kind: "card",
      body: `${recap.headline}\n${recap.lines.join("\n")}\n${recap.nextPreview}`,
      payload: { recap: true, score: recap.score, streak: recap.streak } as unknown as Json,
    });
    delivered++;
  }
  return { delivered };
}
