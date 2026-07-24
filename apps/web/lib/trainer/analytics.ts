import { computeClientLens, type LedgerDayRow } from "@/lib/ledger/score";
import { createServiceClient } from "@/lib/supabase/server";

const DAY_MS = 86_400_000;

export interface ChurnClient {
  id: string;
  name: string;
  risk: number; // 0–100
  driver: string; // the primary reason
}

export interface HistogramBucket {
  label: string;
  count: number;
}

export interface Analytics {
  activeClients: number;
  atRiskCount: number;
  avgAdherence: number | null;
  churn: ChurnClient[];
  histogram: HistogramBucket[];
  zeroEditRate: number | null; // 0–100
  draftsHandled: number;
  timeSavedMinutes: number;
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

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// The coded churn-risk model (MASTER-PLAN feature 10): a weighted blend of a
// logging gap, a 14-day adherence decline, low absolute adherence, and renewal
// overdue. The single largest contributor becomes the shown driver. Message
// sentiment (nightly Haiku batch) + payment fails are P4.3/P8 inputs, wired later.
function churnFor(input: {
  gapDays: number | null;
  thisWeek: number | null;
  lastWeek: number | null;
  score: number | null;
  renewalDays: number | null;
}): { risk: number; driver: string } {
  const parts: { weight: number; driver: string }[] = [];

  if (input.gapDays !== null && input.gapDays >= 3) {
    parts.push({
      weight: Math.min(45, input.gapDays * 7),
      driver: `Logging stopped ${input.gapDays} days ago`,
    });
  }
  if (input.thisWeek !== null && input.lastWeek !== null) {
    const drop = input.lastWeek - input.thisWeek;
    if (drop >= 10) parts.push({ weight: Math.min(30, drop), driver: `Adherence down ${drop} pts this week` });
  }
  if (input.score !== null && input.score < 50) {
    parts.push({ weight: (50 - input.score) * 0.6, driver: `Adherence at ${input.score}%` });
  }
  if (input.renewalDays !== null && input.renewalDays < 0) {
    parts.push({ weight: Math.min(20, -input.renewalDays * 2), driver: "Renewal overdue" });
  }

  if (parts.length === 0) return { risk: 0, driver: "" };
  const risk = Math.min(100, Math.round(parts.reduce((a, p) => a + p.weight, 0)));
  const driver = parts.reduce((a, b) => (b.weight > a.weight ? b : a)).driver;
  return { risk, driver };
}

export async function getAnalytics(orgId: string, now: Date): Promise<Analytics> {
  const service = createServiceClient();
  const windowStart = dateStr(new Date(now.getTime() - 27 * DAY_MS));
  const weekAgo = dateStr(new Date(now.getTime() - 7 * DAY_MS));
  const today = Date.parse(`${dateStr(now)}T00:00:00Z`);

  const [clientsRes, approvedRes, editedRes, activeRes] = await Promise.all([
    service
      .from("clients")
      .select("id, status, intake, profiles:profile_id (display_name)")
      .eq("org_id", orgId)
      .eq("status", "active"),
    // Zero-edit rate from two head counts — no need to pull every draft row.
    service.from("drafts").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "approved"),
    service.from("drafts").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "edited"),
    // Renewal counts from when the plan went live (plans_active.effective_from).
    service
      .from("plans_active")
      .select("client_id, effective_from")
      .eq("org_id", orgId)
      .not("effective_from", "is", null),
  ]);

  const active = clientsRes.data ?? [];
  const ids = active.map((c) => c.id as string);

  const ledgerByClient = new Map<string, LedgerDayRow[]>();
  if (ids.length > 0) {
    const { data: ledger } = await service
      .from("ledger_days")
      .select("client_id, tz_date, expected, misses")
      .in("client_id", ids)
      .gte("tz_date", windowStart)
      .order("tz_date", { ascending: true });
    for (const r of ledger ?? []) {
      const list = ledgerByClient.get(r.client_id as string) ?? [];
      list.push(r as unknown as LedgerDayRow);
      ledgerByClient.set(r.client_id as string, list);
    }
  }

  const effectiveFrom = new Map<string, string>();
  for (const p of activeRes.data ?? []) {
    if (p.effective_from) effectiveFrom.set(p.client_id as string, p.effective_from as string);
  }

  const scores: number[] = [];
  const churn: ChurnClient[] = [];

  for (const client of active) {
    const id = client.id as string;
    const rows = ledgerByClient.get(id) ?? [];
    if (rows.length === 0) continue;
    const lens = computeClientLens(rows);
    scores.push(lens.score);

    const thisWeekRows = rows.filter((r) => r.tz_date >= weekAgo);
    const lastWeekRows = rows.filter((r) => r.tz_date < weekAgo);
    const thisWeek = thisWeekRows.length ? computeClientLens(thisWeekRows).score : null;
    const lastWeek = lastWeekRows.length ? computeClientLens(lastWeekRows).score : null;
    const gapDays = Math.round(
      (today - Date.parse(`${rows[rows.length - 1]!.tz_date}T00:00:00Z`)) / DAY_MS,
    );
    const liveSince = effectiveFrom.get(id);
    const renewalDays = liveSince
      ? 28 - Math.round((now.getTime() - Date.parse(liveSince)) / DAY_MS)
      : null;

    const { risk, driver } = churnFor({ gapDays, thisWeek, lastWeek, score: lens.score, renewalDays });
    if (risk > 0) churn.push({ id, name: resolveName(client), risk, driver });
  }

  churn.sort((a, b) => b.risk - a.risk);

  // Adherence distribution over five 20-point buckets.
  const buckets = ["0–20", "20–40", "40–60", "60–80", "80–100"];
  const histogram: HistogramBucket[] = buckets.map((label) => ({ label, count: 0 }));
  for (const s of scores) {
    const idx = Math.min(4, Math.floor(s / 20));
    histogram[idx]!.count++;
  }

  const approved = approvedRes.count ?? 0;
  const edited = editedRes.count ?? 0;
  const handled = approved + edited;
  const zeroEditRate = handled > 0 ? Math.round((approved / handled) * 100) : null;

  const avgAdherence = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;

  return {
    activeClients: active.length,
    atRiskCount: churn.filter((c) => c.risk >= 40).length,
    avgAdherence,
    churn: churn.slice(0, 8),
    histogram,
    zeroEditRate,
    draftsHandled: handled,
    // Marketing-honest: each approved/edited reply saved ~2 minutes of typing.
    timeSavedMinutes: handled * 2,
  };
}
