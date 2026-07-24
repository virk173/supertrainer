import { expect, test } from "@playwright/test";

import { computeMrr, type SubForRevenue } from "@/lib/trainer/revenue-math";

// Phase 8.5 — MRR + revenue-by-tier are computed in code (rule 4). Tests the
// money math that lights up the P7 analytics stubs.

const sub = (o: Partial<SubForRevenue> = {}): SubForRevenue => ({
  status: "active",
  tierId: "t1",
  tierName: "Pro",
  priceCents: 10000,
  currency: "usd",
  ...o,
});

test("MRR sums active + trialing subscriptions by tier price", () => {
  const r = computeMrr([
    sub({ tierId: "t1", tierName: "Pro", priceCents: 10000 }),
    sub({ tierId: "t1", tierName: "Pro", priceCents: 10000 }),
    sub({ tierId: "t2", tierName: "Elite", priceCents: 20000, status: "trialing" }),
  ]);
  expect(r.mrrCents).toBe(40000);
  expect(r.activeSubscribers).toBe(3);
  expect(r.byTier.find((t) => t.name === "Elite")).toMatchObject({ cents: 20000, subscribers: 1 });
  expect(r.byTier.find((t) => t.tierId === "t1")).toMatchObject({ cents: 20000, subscribers: 2 });
});

test("past_due is at-risk, not MRR", () => {
  const r = computeMrr([
    sub({ status: "active", priceCents: 10000 }),
    sub({ status: "past_due", priceCents: 10000 }),
  ]);
  expect(r.mrrCents).toBe(10000);
  expect(r.activeSubscribers).toBe(1);
  expect(r.atRiskSubscribers).toBe(1);
});

test("canceled / incomplete subscriptions contribute nothing", () => {
  const r = computeMrr([
    sub({ status: "canceled", priceCents: 10000 }),
    sub({ status: "incomplete", priceCents: 10000 }),
  ]);
  expect(r.mrrCents).toBe(0);
  expect(r.activeSubscribers).toBe(0);
});

test("empty → zero MRR, no tiers", () => {
  const r = computeMrr([]);
  expect(r.mrrCents).toBe(0);
  expect(r.byTier).toEqual([]);
});
