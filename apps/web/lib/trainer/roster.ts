import type { ScoreBand } from "@supertrainer/scoring";

import { computeClientLens, type LedgerDayRow } from "@/lib/ledger/score";
import { createServiceClient } from "@/lib/supabase/server";

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 28;

export interface RosterRow {
  id: string;
  name: string;
  status: string;
  adherence: number | null;
  band: ScoreBand | null;
  streak: number;
  atRisk: boolean;
  lastActivityDays: number | null;
  renewalDays: number | null;
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

// The whole roster with each client's coded adherence lens, last activity, and
// renewal window — the data behind the /trainer/clients table. Two grouped reads
// (ledger + approved plans) avoid an N+1 across the roster. Service role bypasses
// RLS, so every query is org-scoped in code.
export async function getRoster(orgId: string, now: Date): Promise<RosterRow[]> {
  const service = createServiceClient();
  const windowStart = dateStr(new Date(now.getTime() - (WINDOW_DAYS - 1) * DAY_MS));
  const today = Date.parse(`${dateStr(now)}T00:00:00Z`);

  const { data: clients } = await service
    .from("clients")
    .select("id, status, intake, profiles:profile_id (display_name)")
    .eq("org_id", orgId);

  const rows = clients ?? [];
  const ids = rows.map((c) => c.id as string);
  if (ids.length === 0) return [];

  const [ledgerRes, activeRes] = await Promise.all([
    service
      .from("ledger_days")
      .select("client_id, tz_date, expected, misses")
      .in("client_id", ids)
      .gte("tz_date", windowStart)
      .order("tz_date", { ascending: true }),
    // The renewal cycle runs from when the plan went LIVE (plans_active.
    // effective_from) — the same field lib/plans/renewals.ts enqueues from — not
    // when the draft was created.
    service
      .from("plans_active")
      .select("client_id, effective_from")
      .in("client_id", ids)
      .not("effective_from", "is", null),
  ]);

  const ledgerByClient = new Map<string, LedgerDayRow[]>();
  for (const r of ledgerRes.data ?? []) {
    const list = ledgerByClient.get(r.client_id as string) ?? [];
    list.push(r as unknown as LedgerDayRow);
    ledgerByClient.set(r.client_id as string, list);
  }

  const effectiveFrom = new Map<string, string>();
  for (const p of activeRes.data ?? []) {
    if (p.effective_from) effectiveFrom.set(p.client_id as string, p.effective_from as string);
  }

  return rows.map((client) => {
    const id = client.id as string;
    const ledger = ledgerByClient.get(id) ?? [];
    const lens = ledger.length ? computeClientLens(ledger) : null;
    const lastActivityDays = ledger.length
      ? Math.round((today - Date.parse(`${ledger[ledger.length - 1]!.tz_date}T00:00:00Z`)) / DAY_MS)
      : null;
    const liveSince = effectiveFrom.get(id);
    const renewalDays = liveSince
      ? 28 - Math.round((now.getTime() - Date.parse(liveSince)) / DAY_MS)
      : null;
    const status = client.status as string;
    const slipping = lens !== null && lens.score < 60;
    const atRisk =
      status === "active" &&
      (slipping || (lastActivityDays !== null && lastActivityDays >= 3));

    return {
      id,
      name: resolveName(client),
      status,
      adherence: lens?.score ?? null,
      band: lens?.band.band ?? null,
      streak: lens?.streak ?? 0,
      atRisk,
      lastActivityDays,
      renewalDays,
    };
  });
}
