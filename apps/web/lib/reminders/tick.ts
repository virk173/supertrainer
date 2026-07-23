import type { SupabaseClient } from "@supabase/supabase-js";

import { reminderCopy } from "./copy";
import { decideReminders, type QuietHours, type ReminderCandidate, type ReminderKind } from "./decide";
import { ensureDefaultReminderRules } from "./rules";

// Phase 3.6 — the reminder tick. For each active client, work out which reminders
// are due now (client-local), apply the decision engine (quiet hours, cap,
// suppression, kill switch), and for each survivor: enqueue a notification (P6
// delivers it) and mirror the prompt into the thread. Idempotent via the
// notification dedupe_key. Takes the db client so it's integration-testable.

const DEFAULT_QUIET: QuietHours = { start: "21:30", end: "07:30" };
const DAILY_CAP = 3;

function localHM(timezone: string, now: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
}
function localDate(timezone: string, now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
}

interface Schedule {
  times?: string[];
  time?: string;
  days?: number[]; // weekday filter (0=Sun); absent = every day
}
function scheduleTimes(schedule: Schedule): string[] {
  if (Array.isArray(schedule.times)) return schedule.times;
  if (typeof schedule.time === "string") return [schedule.time];
  return [];
}

export interface ReminderTickOptions {
  clientIds?: string[];
}

async function isSatisfied(db: SupabaseClient, clientId: string, day: string): Promise<Record<ReminderKind, boolean>> {
  const head = (table: string) =>
    db.from(table).select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("tz_date", day);
  const [meals, weighs, checkins, sets] = await Promise.all([
    head("meal_logs"), head("weigh_ins"), head("gym_checkins"), head("workout_logs"),
  ]);
  return {
    meal: (meals.count ?? 0) > 0,
    weigh_in: (weighs.count ?? 0) > 0,
    checkin: (checkins.count ?? 0) > 0 || (sets.count ?? 0) > 0, // sets auto-satisfy the check-in
    custom: false,
  };
}

export async function runReminderTick(
  db: SupabaseClient,
  now: Date,
  opts: ReminderTickOptions = {},
): Promise<{ sent: number }> {
  let query = db
    .from("clients")
    .select("id, org_id, status, intake, notification_channel, profiles:profile_id (timezone), orgs:org_id (name)")
    .eq("status", "active");
  if (opts.clientIds) query = query.in("id", opts.clientIds);
  const { data: clients, error } = await query;
  if (error) throw error;

  let sent = 0;
  for (const c of clients ?? []) {
    const timezone = ((c.profiles as { timezone?: string } | null)?.timezone) ?? "UTC";
    const coach = ((c.orgs as { name?: string } | null)?.name) ?? null;
    const localNow = localHM(timezone, now);
    const day = localDate(timezone, now);
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();

    // Seed defaults for a brand-new client so reminders work out of the box.
    await ensureDefaultReminderRules(db, c.org_id, c.id, c.intake as never);

    const { data: rules } = await db
      .from("reminder_rules")
      .select("kind, schedule, quiet_hours, enabled")
      .eq("client_id", c.id)
      .eq("enabled", true);
    if (!rules || rules.length === 0) continue; // no rules / vacation -> nothing

    const quietHours = (rules[0].quiet_hours as QuietHours) ?? DEFAULT_QUIET;

    // Earliest passed-today slot per kind, so we send at most one nudge per kind.
    const slotByKind = new Map<ReminderKind, string>();
    for (const r of rules) {
      const sched = r.schedule as Schedule;
      // Day-of-week filter (e.g. weigh-ins Mon/Wed/Sat only).
      if (Array.isArray(sched.days) && !sched.days.includes(weekday)) continue;
      for (const t of scheduleTimes(sched)) {
        if (t <= localNow) {
          const existing = slotByKind.get(r.kind as ReminderKind);
          if (!existing || t < existing) slotByKind.set(r.kind as ReminderKind, t);
        }
      }
    }
    if (slotByKind.size === 0) continue;

    // Drop kinds already enqueued for their slot today (idempotency).
    const keyFor = (kind: ReminderKind, slot: string) => `${c.id}:${kind}:${day}:${slot}`;
    const { data: already } = await db
      .from("notifications")
      .select("dedupe_key")
      .eq("client_id", c.id)
      .like("dedupe_key", `${c.id}:%:${day}:%`);
    const sentKeys = new Set((already ?? []).map((n) => n.dedupe_key));

    const candidates: ReminderCandidate[] = [];
    for (const [kind, slot] of slotByKind) {
      if (!sentKeys.has(keyFor(kind, slot))) candidates.push({ kind, scheduledLocalTime: slot });
    }
    if (candidates.length === 0) continue;

    const decision = decideReminders({
      now: { localTime: localNow },
      candidates,
      quietHours,
      enabled: true,
      paused: false, // active clients only
      satisfied: await isSatisfied(db, c.id, day),
      sentToday: sentKeys.size,
      cap: DAILY_CAP,
    });

    for (const kind of decision.send) {
      const slot = slotByKind.get(kind)!;
      const copy = reminderCopy(kind, coach);
      const channel = c.notification_channel === "push" ? "push" : "email"; // P2 fallback ladder
      const { error: notifErr } = await db
        .from("notifications")
        .upsert(
          {
            org_id: c.org_id,
            client_id: c.id,
            kind,
            channel,
            status: "queued",
            dedupe_key: keyFor(kind, slot),
            payload: { copy, slot } as never,
          },
          { onConflict: "dedupe_key", ignoreDuplicates: true },
        );
      if (notifErr) throw notifErr;

      // Mirror into the thread so the client can scroll their prompt history.
      await db.from("messages").insert({
        org_id: c.org_id,
        client_id: c.id,
        sender: "system",
        kind: "reminder",
        body: copy,
        payload: { reminder_kind: kind } as never,
      });
      sent++;
    }
  }
  return { sent };
}
