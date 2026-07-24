import type { SupabaseClient } from "@supabase/supabase-js";

import { pickCard, type CardGaps } from "@/lib/cards/picker";
import { computeClientLens, type LedgerDayRow } from "@/lib/ledger/score";
import { tzDate, tzTime } from "@/lib/ledger/tz";
import { isQuietHours, type QuietHours } from "@/lib/reminders/decide";
import type { Json } from "@supertrainer/db/types";

// Phase 6.5 — the nightly card tick (db-injected). Per active client: compute the
// data gaps in code, run the picker (caps + quiet hours), and deliver at most one
// card into the thread as a kind='card' system message. Idempotent by the 1/day
// cap — a re-run finds today's card already sent and picks nothing.

const DEFAULT_QUIET: QuietHours = { start: "21:30", end: "07:30" };
const DAY_MS = 24 * 60 * 60 * 1000;

async function computeGaps(db: SupabaseClient, clientId: string, today: string, now: Date): Promise<CardGaps> {
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS).toISOString().slice(0, 10);
  const twoWeeksAgo = new Date(now.getTime() - 14 * DAY_MS).toISOString().slice(0, 10);

  const [sleep, meals, weighs, ledger] = await Promise.all([
    db.from("wearable_daily").select("tz_date").eq("client_id", clientId).not("sleep_min", "is", null).order("tz_date", { ascending: false }).limit(1),
    db.from("meal_logs").select("id", { count: "exact", head: true }).eq("client_id", clientId).gte("tz_date", weekAgo),
    db.from("weigh_ins").select("id", { count: "exact", head: true }).eq("client_id", clientId).gte("tz_date", weekAgo),
    db.from("ledger_days").select("*").eq("client_id", clientId).gte("tz_date", twoWeeksAgo).order("tz_date", { ascending: false }),
  ]);

  // Days since the last night of sleep data.
  const lastSleep = (sleep.data ?? [])[0]?.tz_date as string | undefined;
  const noSleepDays = lastSleep
    ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastSleep}T00:00:00Z`)) / DAY_MS)
    : 999;

  const nonLogger = (meals.count ?? 0) === 0 && (weighs.count ?? 0) === 0;

  // Adherence drop: last 7 closed days vs the 7 before.
  const rows = (ledger.data ?? []) as unknown as LedgerDayRow[];
  const recent = rows.slice(0, 7);
  const prior = rows.slice(7, 14);
  let adherenceDropped = false;
  if (recent.length >= 3 && prior.length >= 3) {
    adherenceDropped = computeClientLens(recent).score < computeClientLens(prior).score - 10;
  }

  return { noSleepDays, adherenceDropped, deloadWeek: false, nonLogger };
}

export interface CardTickOptions {
  clientIds?: string[];
}

export async function runCardTick(
  db: SupabaseClient,
  now: Date,
  opts: CardTickOptions = {},
): Promise<{ delivered: number }> {
  let q = db
    .from("clients")
    .select("id, org_id, profiles:profile_id (timezone)")
    .eq("status", "active");
  if (opts.clientIds) q = q.in("id", opts.clientIds);
  const { data: clients, error } = await q;
  if (error) throw error;

  let delivered = 0;
  for (const c of clients ?? []) {
    const clientId = c.id as string;
    const timezone = (c.profiles as { timezone?: string } | null)?.timezone ?? "UTC";
    const today = tzDate(timezone, now);
    const localTime = tzTime(timezone, now);

    // Quiet hours from any of the client's reminder rules (default otherwise).
    const { data: rules } = await db.from("reminder_rules").select("quiet_hours").eq("client_id", clientId).limit(1);
    const quiet = ((rules ?? [])[0]?.quiet_hours as QuietHours) ?? DEFAULT_QUIET;

    // Frequency counts from delivered CHECK-IN cards only — weekly recaps and the
    // demo card are also kind='card' but must not consume the check-in budget
    // (they have their own cadence), or the "1/day, 3/week" cap would be wrong.
    const weekAgoIso = new Date(now.getTime() - 7 * DAY_MS).toISOString();
    const dayAgoIso = new Date(now.getTime() - DAY_MS).toISOString();
    const [{ count: sentToday }, { count: sentThisWeek }] = await Promise.all([
      db.from("messages").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("kind", "card").contains("payload", { check_in: true }).gte("created_at", dayAgoIso),
      db.from("messages").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("kind", "card").contains("payload", { check_in: true }).gte("created_at", weekAgoIso),
    ]);

    const gaps = await computeGaps(db, clientId, today, now);
    const card = pickCard({
      gaps,
      sentToday: sentToday ?? 0,
      sentThisWeek: sentThisWeek ?? 0,
      isQuietHours: isQuietHours(localTime, quiet),
    });
    if (!card) continue;

    await db.from("messages").insert({
      org_id: c.org_id,
      client_id: clientId,
      sender: "system",
      kind: "card",
      body: card.question,
      payload: {
        check_in: true,
        card_id: card.id,
        card_version: card.version,
        card_kind: card.kind,
        answer_type: card.answerType,
        options: card.options ?? [],
      } as unknown as Json,
    });
    delivered++;
  }
  return { delivered };
}
