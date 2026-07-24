import { createServiceClient } from "@/lib/supabase/server";

const DAY_MS = 86_400_000;
const GRID_DAYS = 84; // 12 weeks

export type CellState = "logged" | "late" | "missed" | "not_expected";

export interface GridRow {
  key: "meals" | "weighIn" | "training" | "checkin";
  label: string;
  cells: { date: string; state: CellState }[];
}

export interface WeightPoint {
  date: string;
  kg: number;
}

export interface ClientProfile {
  id: string;
  name: string;
  status: string;
  memberSince: string | null;
  adherence: number | null;
  consentSignedAt: string | null;
  hasPlan: boolean;
  hasSplit: boolean;
  grid: GridRow[];
  gridDays: string[];
  weight: WeightPoint[];
  weightTrend: { start: WeightPoint; end: WeightPoint } | null;
}

type LedgerExpected = {
  mode?: string;
  mealSlots?: string[];
  minMeals?: number;
  weighIn?: boolean;
  checkin?: boolean;
  sets?: boolean;
};
type LedgerMisses = {
  mealSlots?: string[];
  meals?: number;
  weighIn?: boolean;
  checkin?: boolean;
  sets?: boolean;
};

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

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Per-component state for one day. `late` only applies where something was logged
// but the day was reopened late; a component not expected reads not_expected.
function cellFor(
  expected: boolean,
  missed: boolean,
  late: boolean,
): CellState {
  if (!expected) return "not_expected";
  if (missed) return "missed";
  return late ? "late" : "logged";
}

// Least-squares slope over the weigh-in series → a start/end trend line.
function trendLine(points: WeightPoint[]): ClientProfile["weightTrend"] {
  if (points.length < 2) return null;
  const xs = points.map((_, i) => i);
  const ys = points.map((p) => p.kg);
  const n = xs.length;
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = ys.reduce((a, b) => a + b, 0);
  const sxy = xs.reduce((a, x, i) => a + x * ys[i]!, 0);
  const sxx = xs.reduce((a, x) => a + x * x, 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1);
  const intercept = (sy - slope * sx) / n;
  return {
    start: { date: points[0]!.date, kg: Math.round(intercept * 10) / 10 },
    end: { date: points[n - 1]!.date, kg: Math.round((intercept + slope * (n - 1)) * 10) / 10 },
  };
}

// The forensic client profile (trainer lens): the day-by-day adherence grid (the
// dispute-ender), the weight series + trend, and quick-nav facts. Org ownership
// is checked by the caller.
export async function getClientProfile(
  clientId: string,
  now: Date,
): Promise<ClientProfile | null> {
  const service = createServiceClient();
  const { data: client } = await service
    .from("clients")
    .select("id, org_id, status, intake, consent_signed_at, created_at, profiles:profile_id (display_name)")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) return null;

  const gridStart = dateStr(new Date(now.getTime() - (GRID_DAYS - 1) * DAY_MS));

  const [ledgerRes, weighRes, planRes, splitRes] = await Promise.all([
    service
      .from("ledger_days")
      .select("tz_date, expected, misses, late")
      .eq("client_id", clientId)
      .gte("tz_date", gridStart)
      .order("tz_date", { ascending: true }),
    service
      .from("weigh_ins")
      .select("tz_date, weight_kg")
      .eq("client_id", clientId)
      .order("tz_date", { ascending: true })
      .limit(180),
    service.from("plans").select("id").eq("client_id", clientId).eq("status", "approved").limit(1),
    service.from("splits").select("id").eq("client_id", clientId).eq("status", "approved").limit(1),
  ]);

  const ledgerByDate = new Map(
    (ledgerRes.data ?? []).map((r) => [r.tz_date as string, r]),
  );

  const gridDays: string[] = [];
  for (let i = GRID_DAYS - 1; i >= 0; i--) {
    gridDays.push(dateStr(new Date(now.getTime() - i * DAY_MS)));
  }

  const rowDefs: { key: GridRow["key"]; label: string }[] = [
    { key: "meals", label: "Meals" },
    { key: "weighIn", label: "Weigh-in" },
    { key: "training", label: "Training" },
    { key: "checkin", label: "Check-in" },
  ];

  const grid: GridRow[] = rowDefs.map((def) => ({
    key: def.key,
    label: def.label,
    cells: gridDays.map((date) => {
      const row = ledgerByDate.get(date);
      if (!row) return { date, state: "not_expected" as CellState };
      const exp = (row.expected as LedgerExpected) ?? {};
      const miss = (row.misses as LedgerMisses) ?? {};
      const late = Boolean(row.late);
      let expected = false;
      let missed = false;
      if (def.key === "meals") {
        expected =
          (exp.mode === "plan" && (exp.mealSlots?.length ?? 0) > 0) ||
          (exp.mode === "generic" && (exp.minMeals ?? 0) > 0);
        missed = (miss.meals ?? 0) > 0 || (miss.mealSlots?.length ?? 0) > 0;
      } else if (def.key === "weighIn") {
        expected = Boolean(exp.weighIn);
        missed = Boolean(miss.weighIn);
      } else if (def.key === "training") {
        expected = Boolean(exp.sets);
        missed = Boolean(miss.sets);
      } else {
        expected = Boolean(exp.checkin);
        missed = Boolean(miss.checkin);
      }
      return { date, state: cellFor(expected, missed, late) };
    }),
  }));

  const weight: WeightPoint[] = (weighRes.data ?? []).map((w) => ({
    date: w.tz_date as string,
    kg: Number(w.weight_kg),
  }));

  return {
    id: clientId,
    name: resolveName(client),
    status: client.status as string,
    memberSince: (client.created_at as string) ?? null,
    adherence: null,
    consentSignedAt: (client.consent_signed_at as string | null) ?? null,
    hasPlan: (planRes.data?.length ?? 0) > 0,
    hasSplit: (splitRes.data?.length ?? 0) > 0,
    grid,
    gridDays,
    weight,
    weightTrend: trendLine(weight),
  };
}
