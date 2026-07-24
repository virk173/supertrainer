import { weeklyAdherenceScore, type ScoreBand } from "@supertrainer/scoring";

import {
  computeClientLens,
  dayScoreFromLedger,
  type LedgerDayRow,
} from "@/lib/ledger/score";
import { getPendingBreakdown, type PendingBreakdown } from "@/lib/queue/count";
import { createServiceClient } from "@/lib/supabase/server";

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 14;
const ON_TRACK_THRESHOLD = 60;

export interface DigestClientRef {
  id: string;
  name: string;
}

export interface EscalationItem extends DigestClientRef {
  escalationId: string;
  reason: string;
  selfHarm: boolean;
  ageHours: number;
}

export interface AtRiskItem extends DigestClientRef {
  score: number;
  reason: string;
}

export interface OnTrackClient extends DigestClientRef {
  score: number;
  band: ScoreBand;
  streak: number;
}

export interface HomeDigest {
  pending: PendingBreakdown;
  escalations: EscalationItem[];
  renewals: DigestClientRef[];
  atRisk: AtRiskItem[];
  estimatedMinutes: number;
}

export interface HomeKpis {
  activeClients: number;
  newClientsThisWeek: number;
  pending: PendingBreakdown;
  avgAdherenceThisWeek: number | null;
  avgAdherenceLastWeek: number | null;
  adherenceSparkline: (number | null)[];
}

export interface HomeData {
  kpis: HomeKpis;
  digest: HomeDigest;
  onTrack: OnTrackClient[];
  slippingCount: number;
}

type ClientRow = {
  id: string;
  status: string;
  created_at: string;
  intake: { name?: unknown } | null;
  profiles: { display_name?: string | null } | null;
};

function resolveName(row: {
  intake: { name?: unknown } | null;
  profiles: { display_name?: string | null } | null;
}): string {
  const display = row.profiles?.display_name;
  if (display) return display;
  const intakeName = row.intake?.name;
  return typeof intakeName === "string" ? intakeName : "Client";
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Rough "clear your queue" estimate: replies are quick taps, plans/splits are a
// read-through, escalations need a considered personal reply.
function estimateMinutes(p: PendingBreakdown): number {
  return Math.round(
    p.replies * 1.5 + p.plans * 3 + p.splits * 3 + p.escalations * 2,
  );
}

// Turn an escalation's flags into one human reason line.
function escalationReason(categories: string[], selfHarm: boolean): string {
  if (selfHarm) return "Flagged for wellbeing — review personally";
  if (categories.includes("pain") || categories.includes("injury"))
    return "Pain or injury mentioned";
  if (categories.includes("plan_change")) return "Wants a plan change";
  if (categories.length > 0) return `Flagged: ${categories[0].replace(/_/g, " ")}`;
  return "Needs your attention";
}

// The full Home payload: KPIs, the ordered digest, and the on-track roster.
export async function getHomeData(orgId: string, now: Date): Promise<HomeData> {
  const service = createServiceClient();
  const windowStart = dateStr(new Date(now.getTime() - (WINDOW_DAYS - 1) * DAY_MS));
  const weekAgoMs = now.getTime() - 7 * DAY_MS;

  const [clientsRes, pending, escalationsRes, renewalsRes] = await Promise.all([
    service
      .from("clients")
      .select("id, status, created_at, intake, profiles:profile_id (display_name)")
      .eq("org_id", orgId),
    getPendingBreakdown(orgId),
    service
      .from("escalations")
      .select("id, client_id, categories, self_harm, created_at")
      .eq("org_id", orgId)
      .neq("status", "resolved")
      .order("created_at", { ascending: false })
      .limit(8),
    service
      .from("plan_requests")
      .select("client_id")
      .eq("org_id", orgId)
      .eq("trigger", "monthly")
      .eq("status", "queued"),
  ]);

  const clients = (clientsRes.data ?? []) as ClientRow[];
  const nameOf = new Map(clients.map((c) => [c.id, resolveName(c)]));
  const active = clients.filter((c) => c.status === "active");
  const activeIds = active.map((c) => c.id);

  // One ledger read for every active client over the 14-day window.
  const ledgerByClient = new Map<string, LedgerDayRow[]>();
  if (activeIds.length > 0) {
    const { data: ledger } = await service
      .from("ledger_days")
      .select("client_id, tz_date, expected, misses")
      .in("client_id", activeIds)
      .gte("tz_date", windowStart)
      .order("tz_date", { ascending: true });
    for (const row of ledger ?? []) {
      const list = ledgerByClient.get(row.client_id as string) ?? [];
      list.push(row as unknown as LedgerDayRow);
      ledgerByClient.set(row.client_id as string, list);
    }
  }

  // Per-client lenses + week-over-week for the at-risk and adherence signals.
  const onTrack: OnTrackClient[] = [];
  const slipping: {
    id: string;
    name: string;
    score: number;
    dropPts: number | null;
    gapDays: number | null;
  }[] = [];
  const thisWeekScores: number[] = [];
  const lastWeekScores: number[] = [];
  const weekAgoDate = dateStr(new Date(weekAgoMs));

  for (const client of active) {
    const rows = ledgerByClient.get(client.id) ?? [];
    if (rows.length === 0) continue;
    const lens = computeClientLens(rows);
    const name = nameOf.get(client.id) ?? "Client";

    const thisWeekRows = rows.filter((r) => r.tz_date >= weekAgoDate);
    const lastWeekRows = rows.filter((r) => r.tz_date < weekAgoDate);
    const thisWeek = thisWeekRows.length
      ? computeClientLens(thisWeekRows).score
      : null;
    const lastWeek = lastWeekRows.length
      ? computeClientLens(lastWeekRows).score
      : null;
    if (thisWeek !== null) thisWeekScores.push(thisWeek);
    if (lastWeek !== null) lastWeekScores.push(lastWeek);

    if (lens.score >= ON_TRACK_THRESHOLD) {
      onTrack.push({
        id: client.id,
        name,
        score: lens.score,
        band: lens.band.band,
        streak: lens.streak,
      });
    } else {
      const lastLogged = rows[rows.length - 1]!.tz_date;
      const gapDays = Math.round(
        (Date.parse(`${dateStr(now)}T00:00:00Z`) -
          Date.parse(`${lastLogged}T00:00:00Z`)) /
          DAY_MS,
      );
      const dropPts =
        thisWeek !== null && lastWeek !== null ? lastWeek - thisWeek : null;
      slipping.push({ id: client.id, name, score: lens.score, dropPts, gapDays });
    }
  }

  const avg = (xs: number[]) =>
    xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;

  // 7-day org-average adherence sparkline (oldest → newest; null = no data).
  const sparkline: (number | null)[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = dateStr(new Date(now.getTime() - i * DAY_MS));
    const dayScores: number[] = [];
    for (const rows of ledgerByClient.values()) {
      const row = rows.find((r) => r.tz_date === day);
      if (row) {
        dayScores.push(weeklyAdherenceScore([dayScoreFromLedger(row.expected, row.misses)]));
      }
    }
    sparkline.push(avg(dayScores));
  }

  // At-risk teaser: gap-first, then week-over-week drop, then lowest score.
  const atRisk: AtRiskItem[] = slipping
    .map((s) => {
      let reason: string;
      let severity: number;
      if (s.gapDays !== null && s.gapDays >= 3) {
        reason = `Logging stopped ${s.gapDays} days ago`;
        severity = 300 + s.gapDays;
      } else if (s.dropPts !== null && s.dropPts >= 15) {
        reason = `Adherence down ${s.dropPts} pts this week`;
        severity = 200 + s.dropPts;
      } else {
        reason = `Adherence at ${s.score}%`;
        severity = 100 - s.score;
      }
      return { id: s.id, name: s.name, score: s.score, reason, severity };
    })
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 3)
    .map(({ id, name, score, reason }) => ({ id, name, score, reason }));

  const escalations: EscalationItem[] = (escalationsRes.data ?? []).map((e) => ({
    escalationId: e.id as string,
    id: e.client_id as string,
    name: nameOf.get(e.client_id as string) ?? "Client",
    reason: escalationReason((e.categories as string[]) ?? [], e.self_harm as boolean),
    selfHarm: e.self_harm as boolean,
    ageHours: Math.max(
      0,
      Math.round((now.getTime() - Date.parse(e.created_at as string)) / (60 * 60 * 1000)),
    ),
  }));

  const renewalIds = [
    ...new Set((renewalsRes.data ?? []).map((r) => r.client_id as string)),
  ];
  const renewals: DigestClientRef[] = renewalIds.map((id) => ({
    id,
    name: nameOf.get(id) ?? "Client",
  }));

  const newClientsThisWeek = active.filter(
    (c) => Date.parse(c.created_at) >= weekAgoMs,
  ).length;

  return {
    kpis: {
      activeClients: active.length,
      newClientsThisWeek,
      pending,
      avgAdherenceThisWeek: avg(thisWeekScores),
      avgAdherenceLastWeek: avg(lastWeekScores),
      adherenceSparkline: sparkline,
    },
    digest: {
      pending,
      escalations,
      renewals,
      atRisk,
      estimatedMinutes: estimateMinutes(pending),
    },
    onTrack: onTrack.sort((a, b) => b.score - a.score),
    slippingCount: slipping.length,
  };
}

// The fast-changing slice the Home refreshes on realtime (drafts/escalations).
// The adherence/on-track/at-risk signals are ledger-derived and slow-moving —
// they refresh on navigation, not on every message.
export async function getHomeDigest(
  orgId: string,
  now: Date,
): Promise<Pick<HomeDigest, "pending" | "escalations" | "estimatedMinutes">> {
  const service = createServiceClient();
  const [pending, escalationsRes, names] = await Promise.all([
    getPendingBreakdown(orgId),
    service
      .from("escalations")
      .select("id, client_id, categories, self_harm, created_at")
      .eq("org_id", orgId)
      .neq("status", "resolved")
      .order("created_at", { ascending: false })
      .limit(8),
    service
      .from("clients")
      .select("id, intake, profiles:profile_id (display_name)")
      .eq("org_id", orgId),
  ]);

  const nameOf = new Map(
    (names.data ?? []).map((c) => [
      c.id as string,
      resolveName(c as unknown as ClientRow),
    ]),
  );

  const escalations: EscalationItem[] = (escalationsRes.data ?? []).map((e) => ({
    escalationId: e.id as string,
    id: e.client_id as string,
    name: nameOf.get(e.client_id as string) ?? "Client",
    reason: escalationReason((e.categories as string[]) ?? [], e.self_harm as boolean),
    selfHarm: e.self_harm as boolean,
    ageHours: Math.max(
      0,
      Math.round((now.getTime() - Date.parse(e.created_at as string)) / (60 * 60 * 1000)),
    ),
  }));

  return { pending, escalations, estimatedMinutes: estimateMinutes(pending) };
}
