// Phase 8 — payments environment resolution + gating.
//
// TEST MODE ONLY in dev/preview/CI. Every Stripe key unset ⇒ payments is
// "not configured": onboarding/checkout render a guided blocker, the webhook
// route 503s, and the LIVE-Stripe e2e specs SKIP. The merge gate never touches
// live Stripe — it drives the pure state machine and signs fixture webhook
// payloads with a local test secret (mirror of the ANTHROPIC_API_KEY live-AI
// gating that keeps CI deterministic).

/** The application fee (percent) taken on every client payment. Business rule
 *  §11: stay well under TrueCoach's 5%. Defaults to 2.5 when unset/invalid. */
export function applicationFeePercent(): number {
  const raw = process.env.STRIPE_APPLICATION_FEE_PERCENT;
  const n = raw != null ? Number(raw) : NaN;
  // Guard the fee: never negative, never above a sane ceiling even by typo.
  if (!Number.isFinite(n) || n < 0 || n > 5) return 2.5;
  return n;
}

/** True once the platform secret key is present. Server-only check. */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** True once the webhook signing secret is present (the /api/webhooks/stripe
 *  route fails closed without it — an unverifiable payload is never processed). */
export function isWebhookConfigured(): boolean {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET);
}

/** True in the Vercel/Node production environment (where live Stripe keys are
 *  expected). Everywhere else — dev, preview, CI — must stay test-mode. */
export function isProductionEnv(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}

/** Reject live-mode keys OUTSIDE production (spec §②: dev/preview/CI is test-mode
 *  only). In production a live sk_live_ key is expected and allowed — that's the
 *  go-live switch. A stray live key in a non-prod env throws so it can never
 *  drive a real charge from dev/preview/CI. */
export function assertTestModeKey(key: string): void {
  if (isProductionEnv()) return;
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) {
    throw new Error(
      "payments: live-mode Stripe key detected outside production. Test mode only — use sk_test_.",
    );
  }
}

/** The platform base-fee Price id for a seat band (the trainer's SaaS sub). */
export function platformPriceForSeatBand(
  band: "20" | "50" | "100" | "unlimited",
): string | null {
  const map: Record<string, string | undefined> = {
    "20": process.env.STRIPE_PLATFORM_PRICE_SEATS_20,
    "50": process.env.STRIPE_PLATFORM_PRICE_SEATS_50,
    "100": process.env.STRIPE_PLATFORM_PRICE_SEATS_100,
    unlimited: process.env.STRIPE_PLATFORM_PRICE_SEATS_UNLIMITED,
  };
  return map[band] ?? null;
}

/** Founder-grace flag (Phase 8.6). "1" ⇒ existing orgs get the 60-day founder
 *  trial + founder pricing for life; unset ⇒ standard 14-day trial. */
export function founderGraceEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FOUNDER_GRACE === "1";
}

/** The Stripe PRODUCT TAX CODE stamped on every tier Product created by the tier
 *  sync. Drives STRIPE TAX categorisation (checkout sets automatic_tax), so it
 *  decides how GST/HST/VAT is calculated on every client payment.
 *
 *  NOTE: this is NOT about Managed Payments eligibility — supertrainer can never
 *  qualify for that (Connect platform + Express accounts + human 1-1 coaching are
 *  all excluded), so checkout opts out of it explicitly instead.
 *
 *  Default `txcd_50021003` — "Fee for Personal Training/Fitness Classes". Stripe
 *  files physical exercise under the 50021xxx fitness family (the generic
 *  `txcd_20060044` "Training" code explicitly EXCLUDES physical exercise), so
 *  that family is the right home for coaching even though our delivery is remote
 *  and the code's wording says in-person — Stripe publishes no "remote personal
 *  training" code.
 *
 *  Tax codes are GLOBAL, not per-country: Stripe maps this one code onto each
 *  jurisdiction's rules (Canadian GST/HST included) using the customer's
 *  location. Override per deployment if an accountant advises a different code —
 *  e.g. txcd_20060045 (Training Services - Live Virtual) for a calls-only
 *  offering, or txcd_20030000 (General - Services). Browse them all with
 *  `stripe tax_codes list`. */
export function productTaxCode(): string {
  return process.env.STRIPE_PRODUCT_TAX_CODE?.trim() || "txcd_50021003";
}
