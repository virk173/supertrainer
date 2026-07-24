import { expect, test } from "@playwright/test";

import {
  planTierSync,
  type StripePriceSnapshot,
  type TierForSync,
} from "@/lib/payments/tier-sync";

// Phase 8.1 — the tier↔Stripe sync decision is pure + coded, so the money-shaping
// choices (never mutate a Price, lock the currency, tier is source of truth) are
// exhaustively tested with no live Stripe. This is the CI-deterministic core; the
// worker only executes what this returns.

function tier(over: Partial<TierForSync> = {}): TierForSync {
  return {
    id: "t1",
    name: "Coaching",
    priceCents: 10000,
    currency: "usd",
    isActive: true,
    stripeProductId: null,
    stripePriceId: null,
    ...over,
  };
}

test("empty org → nothing to do", () => {
  const plan = planTierSync([], [], null);
  expect(plan.ops).toEqual([]);
  expect(plan.drift).toEqual([]);
  expect(plan.blocked).toBe(false);
});

test("brand-new tier → create product then price, repointing the tier", () => {
  const plan = planTierSync([tier()], [], null);
  expect(plan.ops).toEqual([
    { kind: "create_product", tierId: "t1", name: "Coaching" },
    { kind: "create_price", tierId: "t1", unitAmount: 10000, currency: "usd" },
  ]);
  expect(plan.nextLockedCurrency).toBe("usd");
});

test("already in sync → idempotent, zero ops", () => {
  const snap: StripePriceSnapshot[] = [
    { priceId: "price_1", productId: "prod_1", unitAmount: 10000, currency: "usd", active: true },
  ];
  const plan = planTierSync(
    [tier({ stripeProductId: "prod_1", stripePriceId: "price_1" })],
    snap,
    "usd",
  );
  expect(plan.ops).toEqual([]);
  expect(plan.drift).toEqual([]);
});

test("reprice → new Price + archive old (never mutate); existing subs keep legacy", () => {
  const snap: StripePriceSnapshot[] = [
    { priceId: "price_old", productId: "prod_1", unitAmount: 10000, currency: "usd", active: true },
  ];
  const plan = planTierSync(
    [tier({ priceCents: 12000, stripeProductId: "prod_1", stripePriceId: "price_old" })],
    snap,
    "usd",
  );
  expect(plan.ops).toEqual([
    { kind: "create_price", tierId: "t1", unitAmount: 12000, currency: "usd" },
    { kind: "archive_price", tierId: "t1", priceId: "price_old" },
  ]);
  expect(plan.drift.map((d) => d.kind)).toContain("price_mismatch");
});

test("tier points at a price the account no longer has → orphaned drift + recreate", () => {
  const plan = planTierSync(
    [tier({ stripeProductId: "prod_1", stripePriceId: "price_gone" })],
    [],
    "usd",
  );
  expect(plan.drift.map((d) => d.kind)).toContain("orphaned_price");
  expect(plan.ops).toEqual([
    { kind: "create_price", tierId: "t1", unitAmount: 10000, currency: "usd" },
  ]);
});

test("archived tier → deactivate its product, no price op", () => {
  const snap: StripePriceSnapshot[] = [
    { priceId: "price_1", productId: "prod_1", unitAmount: 10000, currency: "usd", active: true },
  ];
  const plan = planTierSync(
    [tier({ isActive: false, stripeProductId: "prod_1", stripePriceId: "price_1" })],
    snap,
    "usd",
  );
  expect(plan.ops).toEqual([{ kind: "deactivate_product", tierId: "t1", productId: "prod_1" }]);
});

test("currency lock is set by the first active tier", () => {
  const plan = planTierSync([tier({ currency: "EUR" })], [], null);
  expect(plan.nextLockedCurrency).toBe("eur");
});

test("a tier in a currency other than the lock BLOCKS the whole sync", () => {
  const tiers = [
    tier({ id: "t1", currency: "usd", stripeProductId: "prod_1", stripePriceId: "price_1" }),
    tier({ id: "t2", currency: "eur" }),
  ];
  const snap: StripePriceSnapshot[] = [
    { priceId: "price_1", productId: "prod_1", unitAmount: 10000, currency: "usd", active: true },
  ];
  const plan = planTierSync(tiers, snap, "usd");
  expect(plan.blocked).toBe(true);
  expect(plan.ops).toEqual([]); // nothing executes while a conflict stands
  expect(plan.drift.map((d) => d.kind)).toContain("currency_mismatch");
});

test("archived Stripe price for an active tier → reassert (new price)", () => {
  const snap: StripePriceSnapshot[] = [
    { priceId: "price_1", productId: "prod_1", unitAmount: 10000, currency: "usd", active: false },
  ];
  const plan = planTierSync(
    [tier({ stripeProductId: "prod_1", stripePriceId: "price_1" })],
    snap,
    "usd",
  );
  expect(plan.ops.some((o) => o.kind === "create_price")).toBe(true);
});
