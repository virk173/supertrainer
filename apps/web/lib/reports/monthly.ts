import { computeClientLens, type LedgerDayRow } from "@/lib/ledger/score";
import { createServiceClient } from "@/lib/supabase/server";

const DAY_MS = 86_400_000;

export interface StrengthPR {
  name: string;
  e1rm: number; // estimated 1-rep max, kg
}

export interface MonthlyReport {
  clientName: string;
  orgName: string;
  accentFromBrand: string | null;
  periodLabel: string;
  adherence: number | null;
  streak: number;
  bandLabel: string;
  weightStart: number | null;
  weightEnd: number | null;
  weightDeltaKg: number | null;
  prs: StrengthPR[];
  coachNote: string | null;
}

// Epley — the same estimator the P5 progression engine uses.
function epley1rm(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}

function resolveName(row: {
  intake?: unknown;
  profiles?: { display_name?: string | null } | null;
}): string {
  const display = row.profiles?.display_name;
  if (display) return display;
  const intake = row.intake;
  const name =
    intake && typeof intake === "object" ? (intake as { name?: unknown }).name : undefined;
  return typeof name === "string" ? name : "Client";
}

// The monthly progress report data — assembled IN CODE from the P3 series (weight
// trend, adherence + streak, strength PRs from workout_logs). Org ownership is
// checked by the caller. The coach note is a slot filled by the approved draft
// (report_note) — null here until then.
export async function buildMonthlyReport(
  clientId: string,
  now: Date,
): Promise<MonthlyReport | null> {
  const service = createServiceClient();
  const { data: client } = await service
    .from("clients")
    .select("id, org_id, intake, profiles:profile_id (display_name)")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) return null;

  const windowStart = new Date(now.getTime() - 30 * DAY_MS).toISOString().slice(0, 10);

  const [orgRes, ledgerRes, weighRes, workoutRes] = await Promise.all([
    service.from("orgs").select("name, brand").eq("id", client.org_id as string).maybeSingle(),
    service
      .from("ledger_days")
      .select("tz_date, expected, misses")
      .eq("client_id", clientId)
      .gte("tz_date", windowStart)
      .order("tz_date", { ascending: true }),
    service
      .from("weigh_ins")
      .select("tz_date, weight_kg")
      .eq("client_id", clientId)
      .gte("tz_date", windowStart)
      .order("tz_date", { ascending: true }),
    service
      .from("workout_logs")
      .select("exercise_id, weight_kg, reps")
      .eq("client_id", clientId)
      .gte("tz_date", windowStart)
      .not("weight_kg", "is", null)
      .not("reps", "is", null),
  ]);

  const ledger = (ledgerRes.data ?? []) as unknown as LedgerDayRow[];
  const lens = ledger.length ? computeClientLens(ledger) : null;

  const weighs = weighRes.data ?? [];
  const weightStart = weighs.length ? Number(weighs[0]!.weight_kg) : null;
  const weightEnd = weighs.length ? Number(weighs[weighs.length - 1]!.weight_kg) : null;
  const weightDeltaKg =
    weightStart !== null && weightEnd !== null && weighs.length > 1
      ? Math.round((weightEnd - weightStart) * 10) / 10
      : null;

  // Best estimated 1RM per exercise over the month.
  const bestByExercise = new Map<string, number>();
  for (const w of workoutRes.data ?? []) {
    const e1rm = epley1rm(Number(w.weight_kg), Number(w.reps));
    const key = w.exercise_id as string;
    if (!bestByExercise.has(key) || e1rm > bestByExercise.get(key)!) {
      bestByExercise.set(key, e1rm);
    }
  }
  const topIds = [...bestByExercise.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const nameById = new Map<string, string>();
  if (topIds.length > 0) {
    const { data: exercises } = await service
      .from("exercises")
      .select("id, name")
      .in("id", topIds.map(([id]) => id));
    for (const ex of exercises ?? []) nameById.set(ex.id as string, ex.name as string);
  }
  const prs: StrengthPR[] = topIds.map(([id, e1rm]) => ({
    name: nameById.get(id) ?? "Exercise",
    e1rm: Math.round(e1rm * 10) / 10,
  }));

  // The brand accent is applied (with its default) in the PDF renderer, which is
  // a token-exempt context — this stays hex-free.
  const brand = (orgRes.data?.brand as { primaryColor?: string } | null) ?? null;

  return {
    clientName: resolveName(client),
    orgName: orgRes.data?.name ?? "Your coach",
    periodLabel: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(now),
    accentFromBrand: brand?.primaryColor ?? null,
    adherence: lens?.score ?? null,
    streak: lens?.streak ?? 0,
    bandLabel: lens?.band.label ?? "—",
    weightStart,
    weightEnd,
    weightDeltaKg,
    prs,
    coachNote: null,
  };
}
