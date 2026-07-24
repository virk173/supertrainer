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

/** Reject live-mode keys outright: dev/preview/CI is test-mode only (spec §②).
 *  A key that doesn't start with the test prefix is treated as unconfigured so
 *  a stray sk_live_ never drives a real charge from a non-prod environment. */
export function assertTestModeKey(key: string): void {
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
