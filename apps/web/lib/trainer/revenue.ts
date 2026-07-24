import { createServiceClient } from "@/lib/supabase/server";

import { computeMrr, type RevenueSummary, type SubForRevenue, type TierRevenue } from "./revenue-math";

// Phase 8.5 — payout visibility. MRR + revenue-by-tier are computed IN CODE
// (./revenue-math, pure + tested) from active subscriptions × their tier price
// (rule 4). is_demo clients excluded. Lights up the P7 analytics stubs.

export { computeMrr };
export type { RevenueSummary, SubForRevenue, TierRevenue };

export interface PayoutRow {
  id: string;
  amountCents: number;
  feeCents: number;
  currency: string;
  status: string;
  date: string;
}

export interface RevenueView extends RevenueSummary {
  /** Recent captured payments (payout history), most recent first. */
  history: PayoutRow[];
  /** Sum of platform application fees over the shown history. */
  totalFeesCents: number;
}

/** Read + compute an org's revenue picture from the DB (no Stripe call). */
export async function getRevenue(orgId: string): Promise<RevenueView> {
  const service = createServiceClient();

  // Active subscriptions joined to their client (to drop is_demo) + tier price.
  const { data: subs } = await service
    .from("subscriptions")
    .select("status, tier_id, clients:client_id (is_demo), tiers:tier_id (name, price_cents, currency)")
    .eq("org_id", orgId);

  const forRevenue: SubForRevenue[] = [];
  for (const s of subs ?? []) {
    const client = s.clients as { is_demo?: boolean } | null;
    if (client?.is_demo) continue; // is_demo excluded from billing counts (P1)
    const tier = s.tiers as { name?: string; price_cents?: number; currency?: string } | null;
    forRevenue.push({
      status: s.status,
      tierId: s.tier_id,
      tierName: tier?.name ?? "Untiered",
      priceCents: tier?.price_cents ?? 0,
      currency: tier?.currency ?? "usd",
    });
  }

  const summary = computeMrr(forRevenue);

  const { data: records } = await service
    .from("payment_records")
    .select("id, amount_cents, application_fee_cents, currency, status, created_at")
    .eq("org_id", orgId)
    .eq("status", "paid")
    .order("created_at", { ascending: false })
    .limit(24);

  const history: PayoutRow[] = (records ?? []).map((r) => ({
    id: r.id,
    amountCents: r.amount_cents,
    feeCents: r.application_fee_cents,
    currency: r.currency,
    status: r.status,
    date: r.created_at,
  }));
  const totalFeesCents = history.reduce((a, r) => a + r.feeCents, 0);

  return { ...summary, history, totalFeesCents };
}
