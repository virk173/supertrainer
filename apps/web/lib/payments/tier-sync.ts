// Phase 8.1 — the tier↔Stripe sync DECISION logic, as a pure function.
//
// The worker (lib/payments/connect.ts) fetches the connected account's current
// Products/Prices, calls planTierSync() to decide what to do, then executes the
// ops against Stripe and repoints tiers.stripe_price_id. Keeping the decision
// pure makes it exhaustively testable with no live Stripe (CLAUDE.md rule 4 in
// spirit: the money-shaping decision is coded + tested, not left to a live API
// round-trip). Idempotent by construction: given a snapshot that already matches
// the tiers, planTierSync returns only no-ops.
//
// Invariants enforced here:
//  • A Stripe Price is immutable — a price change NEVER mutates a Price; it
//    creates a NEW Price and repoints the tier. Existing client subscriptions
//    keep their legacy price until a tier-change (8.2).
//  • Currency is locked per org once the first Price exists (a Price's currency
//    is immutable, so tiers can't mix currencies). A tier whose currency differs
//    from the lock is a blocking drift finding, never a silent sync.

export interface TierForSync {
  id: string;
  name: string;
  priceCents: number;
  currency: string;
  isActive: boolean;
  stripeProductId: string | null;
  stripePriceId: string | null;
}

/** What the worker currently sees on the connected account for a tier's Price. */
export interface StripePriceSnapshot {
  priceId: string;
  productId: string;
  unitAmount: number | null;
  currency: string;
  active: boolean;
}

export type SyncOp =
  | { kind: "create_product"; tierId: string; name: string }
  | { kind: "update_product_name"; tierId: string; productId: string; name: string }
  // create_price repoints tier.stripe_price_id to the new Price after creation.
  | { kind: "create_price"; tierId: string; unitAmount: number; currency: string }
  | { kind: "archive_price"; tierId: string; priceId: string }
  | { kind: "deactivate_product"; tierId: string; productId: string };

export interface DriftFinding {
  tierId: string;
  // 'currency_mismatch' blocks the sync (a tier priced in a currency other than
  // the org lock); 'price_mismatch' means the live Stripe unit_amount no longer
  // matches the tier — the tier is source of truth, so we re-assert it (new Price,
  // archive old); 'orphaned_price' means the tier points at a Price the account
  // no longer has. The nightly reconcile logs all three.
  kind: "currency_mismatch" | "price_mismatch" | "orphaned_price";
  detail: string;
}

export interface TierSyncPlan {
  ops: SyncOp[];
  drift: DriftFinding[];
  /** The currency the org locks to after this sync (null if nothing to lock). */
  nextLockedCurrency: string | null;
  /** True when a currency_mismatch blocks the whole sync — the worker must not
   *  execute ANY ops and must surface the conflict to the trainer. */
  blocked: boolean;
}

function normCurrency(c: string): string {
  return c.trim().toLowerCase();
}

export function planTierSync(
  tiers: TierForSync[],
  snapshots: StripePriceSnapshot[],
  lockedCurrency: string | null,
): TierSyncPlan {
  const byPriceId = new Map(snapshots.map((s) => [s.priceId, s]));
  const ops: SyncOp[] = [];
  const drift: DriftFinding[] = [];

  // Establish the currency lock from the first ACTIVE tier if not already locked.
  let lock = lockedCurrency ? normCurrency(lockedCurrency) : null;
  const activeTiers = tiers.filter((t) => t.isActive);
  if (!lock && activeTiers.length > 0) {
    lock = normCurrency(activeTiers[0].currency);
  }

  // A currency mismatch anywhere blocks the whole sync — we never create Prices
  // in mixed currencies on one connected account.
  let blocked = false;
  for (const t of activeTiers) {
    if (lock && normCurrency(t.currency) !== lock) {
      blocked = true;
      drift.push({
        tierId: t.id,
        kind: "currency_mismatch",
        detail: `tier currency ${normCurrency(t.currency)} ≠ locked ${lock}`,
      });
    }
  }
  if (blocked) {
    return { ops: [], drift, nextLockedCurrency: lock, blocked: true };
  }

  for (const t of tiers) {
    // Archived tier: deactivate its product (subs keep running; no new signups).
    if (!t.isActive) {
      if (t.stripeProductId) {
        ops.push({ kind: "deactivate_product", tierId: t.id, productId: t.stripeProductId });
      }
      continue;
    }

    const currency = normCurrency(t.currency);

    // 1. No product yet → create product + first price.
    if (!t.stripeProductId) {
      ops.push({ kind: "create_product", tierId: t.id, name: t.name });
      ops.push({ kind: "create_price", tierId: t.id, unitAmount: t.priceCents, currency });
      continue;
    }

    // 2. Product exists. Reconcile its Price against the tier's price_cents.
    const current = t.stripePriceId ? byPriceId.get(t.stripePriceId) : undefined;

    if (!t.stripePriceId || !current) {
      // Tier points at no live price (first sync of a repriced tier, or the
      // price was deleted in Stripe) → create a fresh price.
      if (t.stripePriceId && !current) {
        drift.push({
          tierId: t.id,
          kind: "orphaned_price",
          detail: `tier price ${t.stripePriceId} not found on account`,
        });
      }
      ops.push({ kind: "create_price", tierId: t.id, unitAmount: t.priceCents, currency });
      continue;
    }

    // 3. Price exists — does it still match the tier?
    const amountMatches = current.unitAmount === t.priceCents;
    const currencyMatches = normCurrency(current.currency) === currency;

    if (!amountMatches || !currencyMatches || !current.active) {
      // Price diverged (trainer edited price/currency, or the price was archived).
      // Never mutate a Price: create a new one, archive the old, repoint the tier.
      if (!amountMatches && current.active) {
        drift.push({
          tierId: t.id,
          kind: "price_mismatch",
          detail: `stripe ${current.unitAmount} ≠ tier ${t.priceCents}`,
        });
      }
      ops.push({ kind: "create_price", tierId: t.id, unitAmount: t.priceCents, currency });
      if (current.active) {
        ops.push({ kind: "archive_price", tierId: t.id, priceId: current.priceId });
      }
    }
    // else: fully in sync → no op for this tier.
  }

  return { ops, drift, nextLockedCurrency: lock, blocked: false };
}
