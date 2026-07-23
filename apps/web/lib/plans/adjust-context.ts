// Monthly-adjustment context compiler (Phase 4.4). Reads the client's last plan
// + ledger history into the coded AdjustmentContext proposeAdjustment consumes.
// All arithmetic (the weigh-in trend slope, averages) is here in code — the model
// never sees raw numbers, only the resulting proposal + reason.

import type { Database } from "@supertrainer/db/types";
import {
  DEFAULT_BULK_RATE_PCT_PER_WEEK,
  DEFAULT_CUT_RATE_PCT_PER_WEEK,
  parseIntake,
  type AdjustmentContext,
  type DayTypeTarget,
  type Goal,
} from "@supertrainer/nutrition-engine";
import type { SupabaseClient } from "@supabase/supabase-js";

import { computeClientLens, type LedgerDayRow } from "@/lib/ledger/score";

type ServiceClient = SupabaseClient<Database>;

const WINDOW_DAYS = 28;

// Least-squares slope of weight (kg) over day-offsets, ×7 → kg/week. Needs ≥2
// points; returns 0 otherwise.
function weeklyWeightSlope(points: { day: number; kg: number }[]): number {
  if (points.length < 2) return 0;
  const n = points.length;
  const sx = points.reduce((s, p) => s + p.day, 0);
  const sy = points.reduce((s, p) => s + p.kg, 0);
  const sxx = points.reduce((s, p) => s + p.day * p.day, 0);
  const sxy = points.reduce((s, p) => s + p.day * p.kg, 0);
  const denom = n * sxx - sx * sx;
  if (denom === 0) return 0;
  return ((n * sxy - sx * sy) / denom) * 7;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export interface CompiledContext {
  context: AdjustmentContext;
  currentPlanId: string | null;
}

export async function compileAdjustmentContext(
  service: ServiceClient,
  clientId: string,
  orgId: string,
  asOf: Date,
): Promise<CompiledContext | null> {
  const { data: client } = await service
    .from("clients")
    .select("id, org_id, intake")
    .eq("id", clientId)
    .maybeSingle();
  if (!client || client.org_id !== orgId) return null;
  const parsed = parseIntake(client.intake, {});
  if (!parsed.ok) return null;
  const goal: Goal = parsed.intake.goal;

  // Current targets from the latest approved plan (fall back to intake weight).
  const { data: plan } = await service
    .from("plans")
    .select("id, day_types")
    .eq("client_id", clientId)
    .eq("status", "approved")
    .order("approved_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const dayTypes = (plan?.day_types as DayTypeTarget[] | null) ?? [];
  // Anchor on the AVERAGE day-type kcal (≈ the primary/maintenance day), not
  // day_types[0] — for a carb-cycle plan [0] is the HIGH day, which would inflate
  // every monthly adjustment. Protein is held constant across day types.
  const currentKcal = dayTypes.length
    ? Math.round(dayTypes.reduce((s, d) => s + d.kcal, 0) / dayTypes.length)
    : 0;
  const currentProtein = dayTypes[0]?.protein_g ?? Math.round(1.6 * parsed.intake.weightKg);

  const from = new Date(asOf.getTime() - WINDOW_DAYS * 86400000).toISOString().slice(0, 10);

  const { data: weighIns } = await service
    .from("weigh_ins")
    .select("tz_date, weight_kg")
    .eq("client_id", clientId)
    .gte("tz_date", from)
    .order("tz_date", { ascending: true });
  const points = (weighIns ?? []).map((w) => ({
    day: Math.round((new Date(w.tz_date).getTime() - new Date(from).getTime()) / 86400000),
    kg: Number(w.weight_kg),
  }));
  const weeklyWeightChangeKg = weeklyWeightSlope(points);
  const weightKg = points.length ? points[points.length - 1].kg : parsed.intake.weightKg;

  const { data: ledgerRows } = await service
    .from("ledger_days")
    .select("tz_date, expected, misses")
    .eq("client_id", clientId)
    .gte("tz_date", from);
  const adherencePct = computeClientLens((ledgerRows ?? []) as unknown as LedgerDayRow[]).score;

  const { data: mealLogs } = await service
    .from("meal_logs")
    .select("totals, tz_date")
    .eq("client_id", clientId)
    .gte("tz_date", from);
  // Average per-DAY kcal over days that had any log.
  const byDay = new Map<string, number>();
  for (const m of mealLogs ?? []) {
    const kcal = Number((m.totals as { kcal?: number })?.kcal ?? 0);
    byDay.set(m.tz_date, (byDay.get(m.tz_date) ?? 0) + kcal);
  }
  const avgLoggedKcal = byDay.size ? Math.round(avg([...byDay.values()]) ?? 0) : null;

  const { data: wearables } = await service
    .from("wearable_daily")
    .select("steps")
    .eq("client_id", clientId)
    .gte("tz_date", from);
  const stepVals = (wearables ?? []).map((w) => Number(w.steps)).filter((s) => Number.isFinite(s) && s > 0);
  const avgSteps = stepVals.length ? Math.round(avg(stepVals) ?? 0) : null;

  const expectedRatePctPerWeek =
    goal === "lose_fat" ? DEFAULT_CUT_RATE_PCT_PER_WEEK : goal === "build_muscle" ? DEFAULT_BULK_RATE_PCT_PER_WEEK : 0;

  return {
    currentPlanId: plan?.id ?? null,
    context: {
      goal,
      currentKcal,
      currentProtein,
      weightKg,
      adherencePct,
      weeklyWeightChangeKg,
      expectedRatePctPerWeek,
      avgLoggedKcal,
      avgSteps,
    },
  };
}
