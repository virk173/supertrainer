// Phase 8.5 — MRR + revenue-by-tier math, PURE (no server imports) so it's
// testable via the e2e specs and safe to import anywhere. The reader that pulls
// the rows lives in ./revenue (server-only).

// Statuses that contribute recurring revenue. past_due is contracted-but-at-risk
// — shown separately as "at risk", not folded into clean MRR.
const MRR_STATUSES = new Set(["active", "trialing"]);

export interface SubForRevenue {
  status: string;
  tierId: string | null;
  tierName: string;
  priceCents: number;
  currency: string;
}

export interface TierRevenue {
  tierId: string | null;
  name: string;
  cents: number;
  subscribers: number;
}

export interface RevenueSummary {
  mrrCents: number;
  currency: string;
  activeSubscribers: number;
  atRiskSubscribers: number;
  byTier: TierRevenue[];
}

/** Pure: MRR + revenue-by-tier from a list of (already non-demo) subscriptions. */
export function computeMrr(subs: SubForRevenue[]): RevenueSummary {
  let mrrCents = 0;
  let activeSubscribers = 0;
  let atRiskSubscribers = 0;
  let currency = "usd";
  const byTier = new Map<string, TierRevenue>();

  for (const s of subs) {
    if (s.currency) currency = s.currency.toLowerCase();
    if (s.status === "past_due" || s.status === "unpaid") {
      atRiskSubscribers++;
      continue;
    }
    if (!MRR_STATUSES.has(s.status)) continue;
    mrrCents += s.priceCents;
    activeSubscribers++;
    const key = s.tierId ?? "untiered";
    const row = byTier.get(key) ?? { tierId: s.tierId, name: s.tierName, cents: 0, subscribers: 0 };
    row.cents += s.priceCents;
    row.subscribers += 1;
    byTier.set(key, row);
  }

  return {
    mrrCents,
    currency,
    activeSubscribers,
    atRiskSubscribers,
    byTier: [...byTier.values()].sort((a, b) => b.cents - a.cents),
  };
}
