import type { SupabaseClient } from "@supabase/supabase-js";

import { remainingMacros, sumLogged, type Macros } from "@/lib/comms/numbers";
import { computeClientLens, type LedgerDayRow } from "@/lib/ledger/score";
import { tzDate } from "@/lib/ledger/tz";

// Phase 6.4 — the per-client context assembler (CODE). Reads the client's live
// plan/split/ledger and TODAY's logged intake, and computes the remaining macros
// in code (never the model). The serialized block is a stable, compact prefix
// (≤~4k tokens by construction) the reply engine caches; long message history is
// capped to the last 20 (a nightly client-summary batch is the deferred fallback).

const MACRO_KEYS = ["kcal", "protein", "carbs", "fat"] as const;

export interface ClientContext {
  clientId: string;
  orgId: string;
  name?: string;
  goal?: string;
  timezone: string;
  todayDayType: string | null;
  target: Macros | null;
  logged: Macros;
  remaining: Macros | null;
  fastWindow: { start: string; end: string } | null;
  mealSlots: string[];
  adherenceScore: number | null;
  band: string | null;
  streak: number | null;
  todaySession: { label: string; exercises: string[] } | null;
  nextSessionLabel: string | null;
  recentMessages: { sender: string; body: string }[];
}

function toMacros(t: Record<string, unknown> | null | undefined): Macros | null {
  if (!t) return null;
  // plans_active targets use *_g keys; normalize to the code shape.
  return {
    kcal: Number(t.kcal ?? 0),
    protein: Number(t.protein_g ?? t.protein ?? 0),
    carbs: Number(t.carbs_g ?? t.carbs ?? 0),
    fat: Number(t.fat_g ?? t.fat ?? 0),
  };
}

export async function assembleClientContext(
  db: SupabaseClient,
  clientId: string,
  now: Date,
): Promise<ClientContext> {
  const { data: client } = await db
    .from("clients")
    .select("id, org_id, intake, profiles:profile_id (timezone)")
    .eq("id", clientId)
    .maybeSingle();
  const orgId = (client?.org_id as string) ?? "";
  const timezone = (client?.profiles as { timezone?: string } | null)?.timezone ?? "UTC";
  const intake = (client?.intake ?? {}) as { name?: unknown; goal?: unknown; stage_b?: { goals?: { goal?: unknown } } };
  const today = tzDate(timezone, now);
  const weekday = String(new Date(`${today}T12:00:00Z`).getUTCDay());

  const [plan, split, meals, ledger, messages] = await Promise.all([
    db.from("plans_active").select("targets, schedule, meal_slots, fast_window").eq("client_id", clientId).maybeSingle(),
    db.from("splits_active").select("days, schedule").eq("client_id", clientId).maybeSingle(),
    db.from("meal_logs").select("totals").eq("client_id", clientId).eq("tz_date", today),
    db.from("ledger_days").select("*").eq("client_id", clientId).order("tz_date", { ascending: false }).limit(14),
    db.from("messages").select("sender, body").eq("client_id", clientId).order("created_at", { ascending: false }).limit(20),
  ]);

  // ── coded macros: today's target − today's logged ──────────────────────────
  const schedule = (plan.data?.schedule ?? {}) as Record<string, string>;
  const todayDayType = schedule[weekday] ?? null;
  const targetsMap = (plan.data?.targets ?? {}) as Record<string, Record<string, unknown>>;
  const target = todayDayType ? toMacros(targetsMap[todayDayType]) : null;
  const logged = sumLogged(((meals.data ?? []) as { totals: Record<string, number> | null }[]).map((m) => m.totals ?? {}));
  const remaining = target ? remainingMacros(target, logged) : null;

  // ── today's / next training session ────────────────────────────────────────
  const splitDays = (split.data?.days ?? {}) as Record<string, { name: string }[]>;
  const splitSchedule = (split.data?.schedule ?? {}) as Record<string, string>;
  const todayLabel = splitSchedule[weekday] ?? null;
  const todaySession =
    todayLabel && splitDays[todayLabel]
      ? { label: todayLabel, exercises: splitDays[todayLabel].map((e) => e.name) }
      : null;
  let nextSessionLabel: string | null = null;
  for (let i = 1; i <= 7; i++) {
    const wd = String((Number(weekday) + i) % 7);
    const label = splitSchedule[wd];
    if (label && splitDays[label]?.length) {
      nextSessionLabel = label;
      break;
    }
  }

  // ── adherence lens ──────────────────────────────────────────────────────────
  const rows = (ledger.data ?? []) as unknown as LedgerDayRow[];
  const lens = rows.length ? computeClientLens(rows) : null;

  const fw = plan.data?.fast_window as { start?: string; end?: string } | null;

  return {
    clientId,
    orgId,
    name: typeof intake.name === "string" ? intake.name : undefined,
    goal:
      typeof intake.goal === "string"
        ? intake.goal
        : typeof intake.stage_b?.goals?.goal === "string"
          ? intake.stage_b.goals.goal
          : undefined,
    timezone,
    todayDayType,
    target,
    logged,
    remaining,
    fastWindow: fw?.start && fw?.end ? { start: fw.start, end: fw.end } : null,
    mealSlots: (plan.data?.meal_slots ?? []) as string[],
    adherenceScore: lens?.score ?? null,
    band: lens?.band.band ?? null,
    streak: lens?.streak ?? null,
    todaySession,
    nextSessionLabel,
    // Oldest→newest for the prompt.
    recentMessages: ((messages.data ?? []) as { sender: string; body: string | null }[])
      .map((m) => ({ sender: m.sender, body: m.body ?? "" }))
      .reverse(),
  };
}

// A stable, compact text block for the reply-engine prompt (cache-friendly prefix
// — coded facts first, volatile history last). The numbers are the code-computed
// ones; the model only phrases them.
export function serializeContext(ctx: ClientContext): string {
  const lines: string[] = [];
  lines.push(`<client_context>`);
  if (ctx.name) lines.push(`name: ${ctx.name}`);
  if (ctx.goal) lines.push(`goal: ${ctx.goal}`);
  if (ctx.todayDayType && ctx.target) {
    lines.push(`today: ${ctx.todayDayType} day, target ${macroLine(ctx.target)}`);
    lines.push(`logged so far: ${macroLine(ctx.logged)}`);
    if (ctx.remaining) lines.push(`remaining (computed): ${macroLine(ctx.remaining)}`);
  }
  if (ctx.fastWindow) lines.push(`eating window: ${ctx.fastWindow.start}–${ctx.fastWindow.end}`);
  if (ctx.adherenceScore != null) lines.push(`adherence: ${ctx.adherenceScore}/100 (${ctx.band}), streak ${ctx.streak}`);
  if (ctx.todaySession) lines.push(`today's session: ${ctx.todaySession.label}`);
  else if (ctx.nextSessionLabel) lines.push(`next session: ${ctx.nextSessionLabel}`);
  lines.push(`</client_context>`);
  return lines.join("\n");
}

function macroLine(m: Macros): string {
  return MACRO_KEYS.map((k) => `${k} ${m[k]}${k === "kcal" ? "" : "g"}`).join(", ");
}
