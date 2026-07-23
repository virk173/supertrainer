import type { SupabaseClient } from "@supabase/supabase-js";

// Phase 3.6 — reminder rule defaults + the vacation kill switch.

// Sensible defaults seeded on a client's first tick if they have no rules yet
// (a real deployment can also seed these at intake completion). Meals thrice a
// day, weigh-ins Mon/Wed/Sat morning, an evening check-in.
export const DEFAULT_REMINDER_RULES = [
  { kind: "meal" as const, schedule: { times: ["08:00", "13:00", "19:00"] } },
  { kind: "weigh_in" as const, schedule: { days: [1, 3, 6], time: "07:30" } },
  { kind: "checkin" as const, schedule: { time: "19:00" } },
];

interface Intake {
  stage_b?: {
    nutrition?: { mealTimes?: string[] };
    logistics?: { weighInDays?: Array<number | string> };
  };
}

const DAY_NAME_TO_NUM: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

// Coerce a weekday list to numbers (0=Sun). Intake stores weekday NAMES
// ("Mon"/"Monday"), but the tick compares against a numeric getUTCDay(), so
// names must be normalized or the day filter never matches.
export function toWeekdayNumbers(days: Array<number | string>): number[] {
  return days
    .map((d) => (typeof d === "number" ? d : DAY_NAME_TO_NUM[String(d).slice(0, 3).toLowerCase()]))
    .filter((n): n is number => typeof n === "number" && n >= 0 && n <= 6);
}

// Seed default rules for a client that has none. Idempotent (unique client+kind).
export async function ensureDefaultReminderRules(
  db: SupabaseClient,
  orgId: string,
  clientId: string,
  intake?: Intake,
): Promise<void> {
  const { count } = await db
    .from("reminder_rules")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId);
  if ((count ?? 0) > 0) return;

  const mealTimes = intake?.stage_b?.nutrition?.mealTimes;
  const weighDays = intake?.stage_b?.logistics?.weighInDays;
  const rows = DEFAULT_REMINDER_RULES.map((r) => {
    let schedule: Record<string, unknown> = r.schedule;
    if (r.kind === "meal" && Array.isArray(mealTimes) && mealTimes.length) schedule = { times: mealTimes };
    if (r.kind === "weigh_in" && Array.isArray(weighDays) && weighDays.length) {
      const nums = toWeekdayNumbers(weighDays);
      if (nums.length) schedule = { days: nums, time: "07:30" };
    }
    return { org_id: orgId, client_id: clientId, kind: r.kind, schedule: schedule as never, enabled: true };
  });
  await db.from("reminder_rules").upsert(rows, { onConflict: "client_id,kind", ignoreDuplicates: true });
}

// The kill switch: pause (vacation) or resume all of a client's reminders.
// org-level pause is the same call fanned across the org's clients.
export async function setReminderVacation(
  db: SupabaseClient,
  clientId: string,
  paused: boolean,
): Promise<void> {
  const { error } = await db.from("reminder_rules").update({ enabled: !paused }).eq("client_id", clientId);
  if (error) throw error;
}
