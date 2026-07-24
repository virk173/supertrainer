import type { SupabaseClient } from "@supabase/supabase-js";

import {
  evaluateDay,
  type DayInputs,
  type LedgerDayEval,
  type MealSlot,
} from "@/lib/ledger/day-close";
import { tzDate } from "@/lib/ledger/tz";

// Phase 3.4 — the day-close scheduler wiring. Gathers a client's real logs for a
// finished local day, runs the pure engine (day-close.ts), and writes the
// auto-miss ledger_days row. Idempotent (skips already-closed days); a back-
// dated log reopens the day via recomputeDay, marked `late`.

const DEFAULT_WEIGH_IN_WEEKDAYS = [1, 3, 6]; // Mon / Wed / Sat (P2 intake default)
const DAY_NAME_TO_NUM: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function weighInWeekdays(intake: unknown): number[] {
  const raw = (intake as { stage_b?: { logistics?: { weighInDays?: unknown } } })?.stage_b?.logistics?.weighInDays;
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_WEIGH_IN_WEEKDAYS;
  const nums = raw
    .map((v) => (typeof v === "number" ? v : DAY_NAME_TO_NUM[String(v).slice(0, 3).toLowerCase()]))
    .filter((n): n is number => typeof n === "number");
  return nums.length ? nums : DEFAULT_WEIGH_IN_WEEKDAYS;
}

interface ClientRow {
  id: string;
  org_id: string;
  status: DayInputs["status"];
  intake: unknown;
  timezone: string;
}

// Assemble the pure engine's inputs for one client on one local date.
async function gatherDayInputs(
  db: SupabaseClient,
  client: ClientRow,
  date: string,
): Promise<DayInputs> {
  const weekday = weekdayOf(date);

  const [plan, split, meals, weigh, checkin, sets, sub] = await Promise.all([
    db.from("plans_active").select("meal_slots").eq("client_id", client.id).maybeSingle(),
    db.from("splits_active").select("days, schedule").eq("client_id", client.id).maybeSingle(),
    db.from("meal_logs").select("meal_slot").eq("client_id", client.id).eq("tz_date", date),
    db.from("weigh_ins").select("id", { count: "exact", head: true }).eq("client_id", client.id).eq("tz_date", date),
    db.from("gym_checkins").select("id", { count: "exact", head: true }).eq("client_id", client.id).eq("tz_date", date),
    db.from("workout_logs").select("id", { count: "exact", head: true }).eq("client_id", client.id).eq("tz_date", date),
    // Phase 8.4 gap-fairness: a billing interruption (dunning/uncaptured or
    // vacation pause) suppresses the day's expectations.
    db.from("subscriptions").select("status, pause_reason").eq("client_id", client.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const planRow = plan.data as { meal_slots?: MealSlot[] } | null;
  const planExpectation = planRow ? { mealSlots: (planRow.meal_slots ?? []) as MealSlot[] } : null;

  let isTrainingDay: boolean | null = null;
  if (split.data) {
    const schedule = (split.data.schedule ?? {}) as Record<string, string>;
    const days = (split.data.days ?? {}) as Record<string, unknown[]>;
    const dayKey = schedule[String(weekday)];
    isTrainingDay = Boolean(dayKey && Array.isArray(days[dayKey]) && days[dayKey].length > 0);
  }

  const mealSlots = [...new Set((meals.data ?? []).map((m) => m.meal_slot as MealSlot))];

  const subRow = sub.data as { status?: string; pause_reason?: string } | null;
  const paymentGap =
    subRow != null &&
    (subRow.status === "past_due" ||
      subRow.status === "unpaid" ||
      subRow.status === "paused" ||
      subRow.pause_reason === "dunning" ||
      subRow.pause_reason === "vacation");

  return {
    status: client.status,
    plan: planExpectation,
    isTrainingDay,
    isWeighInDay: weighInWeekdays(client.intake).includes(weekday),
    paymentGap,
    actual: {
      mealSlots,
      mealCount: meals.data?.length ?? 0,
      weighIn: (weigh.count ?? 0) > 0,
      checkin: (checkin.count ?? 0) > 0,
      sets: (sets.count ?? 0) > 0,
    },
  };
}

async function writeLedgerDay(
  db: SupabaseClient,
  orgId: string,
  clientId: string,
  date: string,
  evalv: LedgerDayEval,
  closedAt: Date,
): Promise<void> {
  const { error } = await db.from("ledger_days").upsert(
    {
      org_id: orgId,
      client_id: clientId,
      tz_date: date,
      expected: evalv.expected as never,
      actual: evalv.actual as never,
      misses: evalv.misses as never,
      late: evalv.late,
      closed_at: closedAt.toISOString(),
    },
    { onConflict: "client_id,tz_date" },
  );
  if (error) throw error;
}

export interface MissedDayEvent {
  orgId: string;
  clientId: string;
  tzDate: string;
  misses: number;
}

export interface CloseDueDaysOptions {
  // Limit to specific clients (tests / targeted runs). Omit to close all.
  clientIds?: string[];
  // How many finished local days back to close (default 2 — catches a missed run).
  window?: number;
  // Fired for each day closed with misses (the cron wires trackServer here). Kept
  // injected so this module stays free of the server-only analytics import and
  // remains unit-testable.
  onMissedDay?: (e: MissedDayEvent) => Promise<void> | void;
}

// Close every active client's finished-but-unclosed local days. Anything
// expected-but-absent becomes a miss (never blank). Idempotent: an already-
// closed day is skipped, not rewritten.
export async function closeDueDays(
  db: SupabaseClient,
  now: Date,
  opts: CloseDueDaysOptions = {},
): Promise<{ closed: number }> {
  const window = opts.window ?? 2;
  let query = db
    .from("clients")
    .select("id, org_id, status, intake, profiles:profile_id (timezone)")
    .eq("status", "active");
  if (opts.clientIds) query = query.in("id", opts.clientIds);
  const { data: clients, error } = await query;
  if (error) throw error;

  let closed = 0;
  for (const c of clients ?? []) {
    const timezone = ((c.profiles as { timezone?: string } | null)?.timezone) ?? "UTC";
    const client: ClientRow = { id: c.id, org_id: c.org_id, status: c.status, intake: c.intake, timezone };
    const today = tzDate(timezone, now);

    const { data: existing } = await db.from("ledger_days").select("tz_date").eq("client_id", c.id);
    const done = new Set((existing ?? []).map((r) => r.tz_date));

    for (let k = 1; k <= window; k++) {
      const date = addDays(today, -k);
      if (done.has(date)) continue;
      const evalv = evaluateDay(await gatherDayInputs(db, client, date));
      await writeLedgerDay(db, client.org_id, client.id, date, evalv, now);
      closed++;
      if (evalv.misses.total > 0) {
        await opts.onMissedDay?.({
          orgId: client.org_id,
          clientId: client.id,
          tzDate: date,
          misses: evalv.misses.total,
        });
      }
    }
  }
  return { closed };
}

// Reopen + recompute a specific day after a back-dated log lands within the
// 48h window. If the day was already closed, the result is flagged `late`.
export async function recomputeDay(
  db: SupabaseClient,
  clientId: string,
  date: string,
): Promise<LedgerDayEval> {
  const { data: c, error } = await db
    .from("clients")
    .select("id, org_id, status, intake, profiles:profile_id (timezone)")
    .eq("id", clientId)
    .single();
  if (error) throw error;

  const timezone = ((c.profiles as { timezone?: string } | null)?.timezone) ?? "UTC";
  const client: ClientRow = { id: c.id, org_id: c.org_id, status: c.status, intake: c.intake, timezone };

  const { data: prior } = await db
    .from("ledger_days")
    .select("closed_at")
    .eq("client_id", clientId)
    .eq("tz_date", date)
    .maybeSingle();
  const wasClosed = Boolean(prior?.closed_at);

  const inputs = await gatherDayInputs(db, client, date);
  inputs.late = wasClosed;
  const evalv = evaluateDay(inputs);
  await writeLedgerDay(db, client.org_id, clientId, date, evalv, new Date());
  return evalv;
}
