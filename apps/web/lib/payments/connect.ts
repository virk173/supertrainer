import "server-only";

import { recordAudit } from "@supertrainer/db/queries";
import type { Json } from "@supertrainer/db/types";
import { isStripeConfigured } from "@supertrainer/payments";
import { getStripeClient } from "@supertrainer/payments/client";

import { createClient, createServiceClient } from "@/lib/supabase/server";

import {
  planTierSync,
  type StripePriceSnapshot,
  type SyncOp,
  type TierForSync,
} from "./tier-sync";

// Phase 8.1 — the Connect onboarding + tier-sync worker. All Stripe calls are
// gated on isStripeConfigured() by the caller; all DB WRITES use the service
// role with org_id verified in code (service-role bypasses RLS — the tenancy
// rule). Reads for the UI use the RLS client so a trainer only sees their org.

export interface ConnectStatus {
  stripeAccountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDue: string[];
  disabledReason: string | null;
  lockedCurrency: string | null;
}

export interface BillingOverview {
  connect: ConnectStatus | null;
  platformSub: {
    seatBand: string;
    status: string;
    trialEnd: string | null;
    currentPeriodEnd: string | null;
    founderPricing: boolean;
  } | null;
  // Tiers that still need a Stripe price (a paid tier with no stripe_price_id).
  unsyncedPaidTiers: number;
  activeTiers: number;
}

// ── reads (UI) ────────────────────────────────────────────────────────────────

/** The billing overview for the trainer's settings page. RLS-scoped read. */
export async function getBillingOverview(orgId: string): Promise<BillingOverview> {
  const db = await createClient();

  const [{ data: acct }, { data: sub }, { data: tiers }] = await Promise.all([
    db
      .from("connect_accounts")
      .select(
        "stripe_account_id, charges_enabled, payouts_enabled, details_submitted, requirements, locked_currency",
      )
      .eq("org_id", orgId)
      .maybeSingle(),
    db
      .from("platform_subscriptions")
      .select("seat_band, status, trial_end, current_period_end, founder_pricing")
      .eq("org_id", orgId)
      .maybeSingle(),
    db.from("tiers").select("is_active, price_cents, stripe_price_id").eq("org_id", orgId),
  ]);

  const activeTiers = (tiers ?? []).filter((t) => t.is_active);
  const unsyncedPaidTiers = activeTiers.filter(
    (t) => t.price_cents > 0 && !t.stripe_price_id,
  ).length;

  const req = (acct?.requirements ?? {}) as {
    currently_due?: string[];
    disabled_reason?: string | null;
  };

  return {
    connect: acct
      ? {
          stripeAccountId: acct.stripe_account_id,
          chargesEnabled: acct.charges_enabled,
          payoutsEnabled: acct.payouts_enabled,
          detailsSubmitted: acct.details_submitted,
          requirementsDue: req.currently_due ?? [],
          disabledReason: req.disabled_reason ?? null,
          lockedCurrency: acct.locked_currency,
        }
      : null,
    platformSub: sub
      ? {
          seatBand: sub.seat_band,
          status: sub.status,
          trialEnd: sub.trial_end,
          currentPeriodEnd: sub.current_period_end,
          founderPricing: sub.founder_pricing,
        }
      : null,
    unsyncedPaidTiers,
    activeTiers: activeTiers.length,
  };
}

// ── Connect account lifecycle (service-role writes) ──────────────────────────

/** Create the connected Express account for an org if it has none, and persist
 *  the connect_accounts snapshot. Idempotent: a second call returns the existing
 *  account id. Returns the stripe_account_id. */
export async function ensureConnectAccount(orgId: string): Promise<string> {
  const service = createServiceClient();

  const { data: existing } = await service
    .from("connect_accounts")
    .select("stripe_account_id")
    .eq("org_id", orgId)
    .maybeSingle();
  if (existing?.stripe_account_id) return existing.stripe_account_id;

  // Verify the org exists (tenancy anchor) before creating anything in Stripe.
  const { data: org, error: orgErr } = await service
    .from("orgs")
    .select("id, name")
    .eq("id", orgId)
    .single();
  if (orgErr || !org) throw new Error("ensureConnectAccount: org not found");

  const stripe = getStripeClient();
  const account = await stripe.accounts.create(
    {
      type: "express",
      // The platform controls fees + collects the application fee; the trainer
      // owns their customers' relationship. Capabilities requested up front.
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_profile: { name: org.name ?? undefined },
      metadata: { org_id: orgId },
    },
    { idempotencyKey: `connect:acct:${orgId}` },
  );

  const { error } = await service.from("connect_accounts").insert({
    org_id: orgId,
    stripe_account_id: account.id,
    charges_enabled: account.charges_enabled ?? false,
    payouts_enabled: account.payouts_enabled ?? false,
    details_submitted: account.details_submitted ?? false,
    requirements: (account.requirements ?? {}) as unknown as Json,
    default_currency: account.default_currency ?? null,
    country: account.country ?? null,
  });
  if (error) throw error;

  await recordAudit(service, {
    orgId,
    action: "connect.account_created",
    entityType: "connect_account",
    entityId: account.id,
    payload: { country: account.country ?? null },
  });

  return account.id;
}

/** An onboarding (or re-onboarding) account link for the org's connected account.
 *  refresh_url is hit if the link expires; return_url when the trainer finishes. */
export async function createOnboardingLink(
  orgId: string,
  opts: { returnUrl: string; refreshUrl: string },
): Promise<string> {
  const accountId = await ensureConnectAccount(orgId);
  const stripe = getStripeClient();
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: opts.refreshUrl,
    return_url: opts.returnUrl,
    type: "account_onboarding",
  });
  return link.url;
}

/** Pull the live account state from Stripe and persist the snapshot. Called on
 *  return from onboarding and by account.updated (8.3). Returns the new status. */
export async function refreshAccountStatus(orgId: string): Promise<ConnectStatus> {
  const service = createServiceClient();
  const { data: row } = await service
    .from("connect_accounts")
    .select("stripe_account_id, locked_currency")
    .eq("org_id", orgId)
    .maybeSingle();
  if (!row?.stripe_account_id) {
    return {
      stripeAccountId: null,
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      requirementsDue: [],
      disabledReason: null,
      lockedCurrency: null,
    };
  }

  const stripe = getStripeClient();
  const account = await stripe.accounts.retrieve(row.stripe_account_id);
  const requirements = (account.requirements ?? {}) as {
    currently_due?: string[];
    disabled_reason?: string | null;
  };

  const { error } = await service
    .from("connect_accounts")
    .update({
      charges_enabled: account.charges_enabled ?? false,
      payouts_enabled: account.payouts_enabled ?? false,
      details_submitted: account.details_submitted ?? false,
      requirements: requirements as unknown as Json,
      default_currency: account.default_currency ?? null,
      country: account.country ?? null,
    })
    .eq("org_id", orgId);
  if (error) throw error;

  return {
    stripeAccountId: row.stripe_account_id,
    chargesEnabled: account.charges_enabled ?? false,
    payoutsEnabled: account.payouts_enabled ?? false,
    detailsSubmitted: account.details_submitted ?? false,
    requirementsDue: requirements.currently_due ?? [],
    disabledReason: requirements.disabled_reason ?? null,
    lockedCurrency: row.locked_currency,
  };
}

// ── tier sync (service-role writes; executes planTierSync ops) ────────────────

export interface TierSyncResult {
  applied: SyncOp[];
  drift: { tierId: string; kind: string; detail: string }[];
  blocked: boolean;
}

/** Sync the org's tiers to Stripe Products/Prices on the connected account.
 *  Idempotent + drift-detecting: builds the current snapshot, plans the diff,
 *  executes, repoints tiers, and logs drift to audit_log. */
export async function runTierSync(
  orgId: string,
  actorProfileId: string | null,
): Promise<TierSyncResult> {
  const service = createServiceClient();

  const { data: acct } = await service
    .from("connect_accounts")
    .select("stripe_account_id, locked_currency, charges_enabled")
    .eq("org_id", orgId)
    .maybeSingle();
  if (!acct?.stripe_account_id) {
    throw new Error("runTierSync: org has no connected account");
  }
  const stripeAccount = acct.stripe_account_id;

  const { data: tierRows, error: tierErr } = await service
    .from("tiers")
    .select("id, name, price_cents, currency, is_active, stripe_product_id, stripe_price_id")
    .eq("org_id", orgId);
  if (tierErr) throw tierErr;

  const tiers: TierForSync[] = (tierRows ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    priceCents: t.price_cents,
    currency: t.currency,
    isActive: t.is_active,
    stripeProductId: t.stripe_product_id,
    stripePriceId: t.stripe_price_id,
  }));

  const stripe = getStripeClient();

  // Build the snapshot by retrieving each tier's referenced price (missing ⇒
  // orphaned, handled by the planner). Kept minimal — no full list needed.
  const snapshots: StripePriceSnapshot[] = [];
  for (const t of tiers) {
    if (!t.stripePriceId) continue;
    try {
      const price = await stripe.prices.retrieve(t.stripePriceId, { stripeAccount });
      snapshots.push({
        priceId: price.id,
        productId: typeof price.product === "string" ? price.product : price.product.id,
        unitAmount: price.unit_amount,
        currency: price.currency,
        active: price.active,
      });
    } catch {
      // retrieve failed (deleted/invalid) → leave out; planner marks orphaned.
    }
  }

  const plan = planTierSync(tiers, snapshots, acct.locked_currency);

  if (plan.drift.length > 0) {
    await recordAudit(service, {
      orgId,
      actorProfileId,
      action: "connect.tier_sync.drift",
      entityType: "tier_sync",
      payload: { drift: plan.drift, blocked: plan.blocked },
    });
  }

  if (plan.blocked) {
    return { applied: [], drift: plan.drift, blocked: true };
  }

  // Track product ids per tier so a create_price after a create_product in the
  // same run points at the just-created product.
  const productForTier = new Map<string, string>();
  for (const t of tiers) if (t.stripeProductId) productForTier.set(t.id, t.stripeProductId);

  const applied: SyncOp[] = [];
  for (const op of plan.ops) {
    switch (op.kind) {
      case "create_product": {
        const product = await stripe.products.create(
          { name: op.name, metadata: { org_id: orgId, tier_id: op.tierId } },
          { stripeAccount, idempotencyKey: `product:${op.tierId}` },
        );
        productForTier.set(op.tierId, product.id);
        await service.from("tiers").update({ stripe_product_id: product.id }).eq("id", op.tierId);
        applied.push(op);
        break;
      }
      case "update_product_name": {
        await stripe.products.update(op.productId, { name: op.name }, { stripeAccount });
        applied.push(op);
        break;
      }
      case "create_price": {
        const product = productForTier.get(op.tierId);
        if (!product) break; // product op must have run first
        const price = await stripe.prices.create(
          {
            product,
            unit_amount: op.unitAmount,
            currency: op.currency,
            recurring: { interval: "month" },
            metadata: { org_id: orgId, tier_id: op.tierId },
          },
          {
            stripeAccount,
            idempotencyKey: `price:${op.tierId}:${op.unitAmount}:${op.currency}`,
          },
        );
        await service.from("tiers").update({ stripe_price_id: price.id }).eq("id", op.tierId);
        applied.push(op);
        break;
      }
      case "archive_price": {
        await stripe.prices.update(op.priceId, { active: false }, { stripeAccount });
        applied.push(op);
        break;
      }
      case "deactivate_product": {
        await stripe.products.update(op.productId, { active: false }, { stripeAccount });
        applied.push(op);
        break;
      }
    }
  }

  // Lock the org currency after the first successful price sync.
  if (!acct.locked_currency && plan.nextLockedCurrency) {
    await service
      .from("connect_accounts")
      .update({ locked_currency: plan.nextLockedCurrency })
      .eq("org_id", orgId);
  }

  if (applied.length > 0) {
    await recordAudit(service, {
      orgId,
      actorProfileId,
      action: "connect.tier_sync.applied",
      entityType: "tier_sync",
      payload: { ops: applied.map((o) => o.kind), count: applied.length },
    });
  }

  return {
    applied,
    drift: plan.drift,
    blocked: false,
  };
}

// ── nightly reconcile (detect-only) ──────────────────────────────────────────

/** Detect-only drift check for one org: plans the sync but does NOT execute —
 *  it only records any drift to audit_log. The nightly cron calls this across
 *  every connected org so a Stripe-side edit (price changed in the dashboard,
 *  deleted price) surfaces without a background job silently mutating billing. */
export async function reconcileOrgTiers(
  orgId: string,
): Promise<{ drift: number; blocked: boolean }> {
  const service = createServiceClient();
  const { data: acct } = await service
    .from("connect_accounts")
    .select("stripe_account_id, locked_currency")
    .eq("org_id", orgId)
    .maybeSingle();
  if (!acct?.stripe_account_id) return { drift: 0, blocked: false };

  const { data: tierRows } = await service
    .from("tiers")
    .select("id, name, price_cents, currency, is_active, stripe_product_id, stripe_price_id")
    .eq("org_id", orgId);

  const tiers: TierForSync[] = (tierRows ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    priceCents: t.price_cents,
    currency: t.currency,
    isActive: t.is_active,
    stripeProductId: t.stripe_product_id,
    stripePriceId: t.stripe_price_id,
  }));

  const stripe = getStripeClient();
  const snapshots: StripePriceSnapshot[] = [];
  for (const t of tiers) {
    if (!t.stripePriceId) continue;
    try {
      const price = await stripe.prices.retrieve(t.stripePriceId, {
        stripeAccount: acct.stripe_account_id,
      });
      snapshots.push({
        priceId: price.id,
        productId: typeof price.product === "string" ? price.product : price.product.id,
        unitAmount: price.unit_amount,
        currency: price.currency,
        active: price.active,
      });
    } catch {
      /* orphaned — planner reports it */
    }
  }

  const plan = planTierSync(tiers, snapshots, acct.locked_currency);
  if (plan.drift.length > 0 || plan.ops.length > 0) {
    await recordAudit(service, {
      orgId,
      action: "connect.tier_sync.reconcile_drift",
      entityType: "tier_sync",
      payload: {
        drift: plan.drift,
        pendingOps: plan.ops.map((o) => o.kind),
        blocked: plan.blocked,
      },
    });
  }
  return { drift: plan.drift.length, blocked: plan.blocked };
}

/** Run the reconcile across every org with a connected account. Returns a
 *  per-org drift summary. Called by the nightly cron. */
export async function reconcileAllOrgs(): Promise<
  { orgId: string; drift: number; blocked: boolean }[]
> {
  const service = createServiceClient();
  const { data: accounts } = await service
    .from("connect_accounts")
    .select("org_id")
    .not("stripe_account_id", "is", null);

  const results: { orgId: string; drift: number; blocked: boolean }[] = [];
  for (const a of accounts ?? []) {
    try {
      const r = await reconcileOrgTiers(a.org_id);
      results.push({ orgId: a.org_id, ...r });
    } catch (err) {
      console.error("[payments] reconcile failed for org", a.org_id, err);
    }
  }
  return results;
}

// re-export for callers/tests
export { isStripeConfigured };
