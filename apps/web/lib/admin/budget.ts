import "server-only";

import { recordAudit } from "@supertrainer/db/queries";

import { createServiceClient } from "@/lib/supabase/server";

import { budgetState, DEFAULT_AI_BUDGET_MICROS } from "./metrics-core";

// Phase 9.3 — the AI budget meter's enforcement half (MASTER-PLAN §4.3).
//
// Crossing the cap does NOT cut a trainer off. It flips the org into batch-only
// mode: the things a person is waiting for (a reply draft, a meal parse) keep
// running; the things a scheduler decided to do (nightly digests, card
// selection, edit distillation) stand down until the next period. Protecting
// margin must never look, from the client's side, like the coach went quiet.

const PERIOD_DAYS = 30;

export interface BudgetVerdict {
  orgId: string;
  spendMicros: number;
  capMicros: number;
  state: "ok" | "near" | "over";
  changed: boolean;
}

/** Spend for one org over the trailing period. */
export async function orgSpendMicros(orgId: string, now = new Date()): Promise<number> {
  const service = createServiceClient();
  const since = new Date(now.getTime() - PERIOD_DAYS * 86_400_000).toISOString();
  const { data } = await service
    .from("ai_usage")
    .select("cost_micros")
    .eq("org_id", orgId)
    .gte("occurred_at", since);
  return (data ?? []).reduce((n, r) => n + Number(r.cost_micros), 0);
}

/** Is non-urgent AI currently stood down for this org? */
export async function isThrottled(orgId: string): Promise<boolean> {
  const service = createServiceClient();
  const { data } = await service
    .from("orgs")
    .select("ai_throttled_at")
    .eq("id", orgId)
    .maybeSingle();
  return Boolean(data?.ai_throttled_at);
}

/** Sweep every org: throttle the ones over cap, release the ones back under it.
 *  Idempotent — only a state CHANGE writes or audits. */
export async function evaluateBudgets(now = new Date()): Promise<BudgetVerdict[]> {
  const service = createServiceClient();
  const since = new Date(now.getTime() - PERIOD_DAYS * 86_400_000).toISOString();

  const [{ data: orgs }, { data: usage }] = await Promise.all([
    service.from("orgs").select("id, ai_budget_micros, ai_throttled_at"),
    service.from("ai_usage").select("org_id, cost_micros").gte("occurred_at", since),
  ]);

  const spend = new Map<string, number>();
  for (const u of usage ?? []) {
    if (!u.org_id) continue;
    spend.set(u.org_id, (spend.get(u.org_id) ?? 0) + Number(u.cost_micros));
  }

  const verdicts: BudgetVerdict[] = [];
  for (const org of orgs ?? []) {
    const spendMicros = spend.get(org.id) ?? 0;
    const capMicros = org.ai_budget_micros === null ? DEFAULT_AI_BUDGET_MICROS : Number(org.ai_budget_micros);
    const state = budgetState(spendMicros, capMicros);
    const wasThrottled = Boolean(org.ai_throttled_at);
    const shouldThrottle = state === "over";
    let changed = false;

    if (shouldThrottle !== wasThrottled) {
      changed = true;
      await service
        .from("orgs")
        .update({ ai_throttled_at: shouldThrottle ? now.toISOString() : null })
        .eq("id", org.id);
      await recordAudit(service, {
        orgId: org.id,
        action: shouldThrottle ? "ai_budget.throttled" : "ai_budget.released",
        entityType: "org",
        entityId: org.id,
        payload: { spend_micros: spendMicros, cap_micros: capMicros },
      });
    }

    verdicts.push({ orgId: org.id, spendMicros, capMicros, state, changed });
  }
  return verdicts;
}

/** Delete spent WebAuthn challenges and expired elevations. Console credentials
 *  should not accumulate: an expired row is only ever a liability. */
export async function sweepAdminSessions(now = new Date()): Promise<number> {
  const service = createServiceClient();
  const cutoff = new Date(now.getTime() - 86_400_000).toISOString();
  const { count: challenges } = await service
    .from("admin_challenges")
    .delete({ count: "exact" })
    .lt("expires_at", cutoff);
  const { count: sessions } = await service
    .from("admin_sessions")
    .delete({ count: "exact" })
    .lt("elevated_until", cutoff);
  return (challenges ?? 0) + (sessions ?? 0);
}

/** Every org currently standing down scheduled AI. One query, so a cron can ask
 *  once instead of per row. */
export async function throttledOrgIds(): Promise<Set<string>> {
  const service = createServiceClient();
  const { data } = await service
    .from("orgs")
    .select("id")
    .not("ai_throttled_at", "is", null);
  return new Set((data ?? []).map((o) => o.id));
}
