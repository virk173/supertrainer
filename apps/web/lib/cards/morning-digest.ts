import type { SupabaseClient } from "@supabase/supabase-js";

import { computeClientLens, type LedgerDayRow } from "@/lib/ledger/score";

// Phase 6.5 — the trainer morning digest (spec §13 core loop). The counts are
// computed in code; the digest just orders them (escalations first). Pure assembly
// is fixtured; computeMorningDigest gathers the counts from the DB (db-injected).

export interface MorningDigestCounts {
  onTrack: number;
  slipping: number;
  pendingDrafts: number;
  renewalsDue: number;
  escalationsOvernight: number;
}

export interface MorningDigest extends MorningDigestCounts {
  lines: string[];
  hasUrgent: boolean;
}

export function assembleMorningDigest(c: MorningDigestCounts): MorningDigest {
  const lines: string[] = [];
  // Most urgent first.
  if (c.escalationsOvernight > 0) {
    lines.push(`🚩 ${c.escalationsOvernight} escalation${c.escalationsOvernight === 1 ? "" : "s"} overnight — review first.`);
  }
  if (c.pendingDrafts > 0) lines.push(`${c.pendingDrafts} repl${c.pendingDrafts === 1 ? "y" : "ies"} waiting for your approval.`);
  lines.push(`${c.onTrack} client${c.onTrack === 1 ? "" : "s"} on track, ${c.slipping} slipping.`);
  if (c.renewalsDue > 0) lines.push(`${c.renewalsDue} plan${c.renewalsDue === 1 ? "" : "s"} due for renewal.`);

  return {
    ...c,
    lines,
    hasUrgent: c.escalationsOvernight > 0 || c.pendingDrafts > 0,
  };
}

// Gathers the counts for one org and assembles the digest. On-track/slipping come
// from each active client's adherence lens over the last ~14 closed ledger days.
export async function computeMorningDigest(
  db: SupabaseClient,
  orgId: string,
  now: Date,
): Promise<MorningDigest> {
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const [clients, drafts, renewals, escalations] = await Promise.all([
    db.from("clients").select("id").eq("org_id", orgId).eq("status", "active"),
    db.from("drafts").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "pending"),
    // Client_ids (not row count) — a client due for renewal has BOTH a diet and a
    // split request queued, so counting rows would report 2 renewals per client.
    db.from("plan_requests").select("client_id").eq("org_id", orgId).eq("trigger", "monthly").eq("status", "queued"),
    db.from("escalations").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "open").gte("created_at", dayAgo),
  ]);

  let onTrack = 0;
  let slipping = 0;
  for (const c of clients.data ?? []) {
    const { data: rows } = await db
      .from("ledger_days")
      .select("*")
      .eq("client_id", c.id as string)
      .order("tz_date", { ascending: false })
      .limit(14);
    if (!rows || rows.length === 0) continue;
    const lens = computeClientLens(rows as unknown as LedgerDayRow[]);
    if (lens.score >= 60) onTrack++;
    else slipping++;
  }

  const renewalClients = new Set((renewals.data ?? []).map((r) => r.client_id as string));

  return assembleMorningDigest({
    onTrack,
    slipping,
    pendingDrafts: drafts.count ?? 0,
    renewalsDue: renewalClients.size,
    escalationsOvernight: escalations.count ?? 0,
  });
}
