// Phase 9.3 — the platform's own numbers, as pure functions.
//
// Two reasons this is a separate, server-free module: it is directly testable,
// and unit economics are arithmetic we must never let a model do (CLAUDE.md rule
// 4). Money is integer cents; AI cost is integer micros (millionths of a
// dollar); the two only meet through an explicit conversion.

export const MICROS_PER_CENT = 10_000;

export function centsToMicros(cents: number): number {
  return Math.round(cents * MICROS_PER_CENT);
}

export type BudgetState = "ok" | "near" | "over";

/** Default soft cap when an org has none set: $25/month of AI. */
export const DEFAULT_AI_BUDGET_MICROS = 25_000_000;
/** "Near" starts at 80% of the cap — early enough to act, late enough to mean it. */
export const NEAR_THRESHOLD = 0.8;

export function budgetState(spendMicros: number, budgetMicros: number | null): BudgetState {
  const cap = budgetMicros ?? DEFAULT_AI_BUDGET_MICROS;
  if (cap <= 0) return "ok";
  if (spendMicros >= cap) return "over";
  if (spendMicros >= cap * NEAR_THRESHOLD) return "near";
  return "ok";
}

export interface OrgHealthInput {
  orgId: string;
  name: string;
  createdAt: string;
  /** active, non-demo clients */
  clientCount: number;
  /** what this org's own clients pay them, in cents */
  clientMrrCents: number;
  /** what this org pays US, in cents */
  platformMrrCents: number;
  /** AI spend this period, micros */
  aiSpendMicros: number;
  aiBudgetMicros: number | null;
  aiThrottledAt: string | null;
  /** drafts the trainer sent untouched ÷ drafts they actioned */
  draftsApproved: number;
  draftsEdited: number;
  /** push notifications sent ÷ attempted */
  pushSent: number;
  pushFailed: number;
  lastActiveAt: string | null;
}

export interface OrgHealth extends OrgHealthInput {
  /** 0–1, or null when they have actioned nothing yet (never show a fake 0%) */
  zeroEditRate: number | null;
  pushSuccessRate: number | null;
  budget: BudgetState;
  /** platform revenue − AI cost − infra estimate, in micros. Can be negative;
   *  a negative margin is the single most useful number on the page. */
  marginMicros: number;
  throttled: boolean;
}

/** Flat infra allowance per org per month (DB, storage, bandwidth), in micros.
 *  A deliberate estimate, stated rather than hidden inside the margin. */
export const INFRA_MICROS_PER_ORG = 2_000_000;

export function orgHealth(input: OrgHealthInput): OrgHealth {
  const actioned = input.draftsApproved + input.draftsEdited;
  const pushAttempts = input.pushSent + input.pushFailed;
  return {
    ...input,
    zeroEditRate: actioned === 0 ? null : input.draftsApproved / actioned,
    pushSuccessRate: pushAttempts === 0 ? null : input.pushSent / pushAttempts,
    budget: budgetState(input.aiSpendMicros, input.aiBudgetMicros),
    marginMicros:
      centsToMicros(input.platformMrrCents) - input.aiSpendMicros - INFRA_MICROS_PER_ORG,
    throttled: Boolean(input.aiThrottledAt),
  };
}

export interface PlatformSummary {
  orgs: number;
  payingOrgs: number;
  mrrCents: number;
  arrCents: number;
  clients: number;
  aiSpendMicros: number;
  marginMicros: number;
  /** orgs whose margin is negative — the ones costing us money */
  unprofitableOrgs: number;
  overBudgetOrgs: number;
}

export function platformSummary(rows: OrgHealth[]): PlatformSummary {
  const mrrCents = rows.reduce((n, r) => n + r.platformMrrCents, 0);
  return {
    orgs: rows.length,
    payingOrgs: rows.filter((r) => r.platformMrrCents > 0).length,
    mrrCents,
    arrCents: mrrCents * 12,
    clients: rows.reduce((n, r) => n + r.clientCount, 0),
    aiSpendMicros: rows.reduce((n, r) => n + r.aiSpendMicros, 0),
    marginMicros: rows.reduce((n, r) => n + r.marginMicros, 0),
    unprofitableOrgs: rows.filter((r) => r.marginMicros < 0).length,
    overBudgetOrgs: rows.filter((r) => r.budget === "over").length,
  };
}

// ── funnels ──────────────────────────────────────────────────────────────────

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
  /** share of the FIRST step — the only denominator that means anything */
  ofTop: number;
}

/** Turn ordered (label, count) pairs into a funnel. Counts are expected to be
 *  monotonically non-increasing; if they aren't, we show them as measured rather
 *  than smoothing, because a rising step means the query is wrong. */
export function funnel(steps: { key: string; label: string; count: number }[]): FunnelStep[] {
  const top = steps[0]?.count ?? 0;
  return steps.map((s) => ({ ...s, ofTop: top === 0 ? 0 : s.count / top }));
}

export interface CohortRow {
  /** YYYY-MM of the org's first month */
  cohort: string;
  started: number;
  retained: number;
}

export function churnRate(row: CohortRow): number | null {
  if (row.started === 0) return null;
  return (row.started - row.retained) / row.started;
}
