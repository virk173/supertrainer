import Stripe from "stripe";

import { assertTestModeKey } from "./env";

// Phase 8 — the single Stripe client factory (mirror of packages/db's Supabase
// factory and packages/ai's getClaudeClient: all Stripe SDK construction lives
// here so gating, test-mode enforcement, and injection have exactly one seam).
//
// SERVER ONLY — never import into a client component (it reads the secret key).
// The pinned `stripe` package version determines the API version; we don't hard-
// code an apiVersion string (Connect/Billing shapes move and a stale literal
// silently diverges from the typed SDK — CLAUDE.md: verify shapes against the
// installed SDK, not memory).

let cached: Stripe | null = null;
let injected: Stripe | null = null;

/** Test seam (mirror of the AI-agent injection the merge gate uses): a spec sets
 *  a fake Stripe client so checkout/onboarding server actions run deterministically
 *  with no live API. Pass null to clear. Never called in production paths. */
export function setStripeClientForTests(fake: Stripe | null): void {
  injected = fake;
  cached = null;
}

/** The Stripe client, or throws if unconfigured. Callers that render a guided
 *  "payments not set up" state should gate on isStripeConfigured() first rather
 *  than catch this. maxRetries:0 keeps idempotency-key retries under our control. */
export function getStripeClient(): Stripe {
  if (injected) return injected;
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "payments: STRIPE_SECRET_KEY is not set. Gate on isStripeConfigured() before calling getStripeClient().",
    );
  }
  assertTestModeKey(key);
  cached = new Stripe(key, { maxNetworkRetries: 0, typescript: true });
  return cached;
}

export type { Stripe };
