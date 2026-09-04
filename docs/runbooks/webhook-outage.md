# Stripe webhook outage

Symptoms: payments succeed in Stripe but the app doesn't know — subscriptions
stay `incomplete`, clients stay locked out, dunning fires at people who paid.

## First, decide which failure it is

| What you see | What it is |
|---|---|
| Stripe dashboard shows delivery attempts failing (4xx/5xx) | Our endpoint is down or erroring |
| Stripe shows successful deliveries, but `webhook_events.processed_at` is null | We received and stored them; processing threw |
| Stripe shows no attempts at all | The endpoint is deleted/disabled, or the signing secret rotated |

The middle case is the designed one: the handler stores every event **before**
processing it, so a processing failure loses nothing.

## Recover

1. **Nothing is dropped.** Stripe retries failed deliveries for up to 3 days, and
   our handler is idempotent on `stripe_event_id`. Fix the cause first; don't
   start replaying into a broken deployment.
2. **Replay the stored, unprocessed events** from the platform console:
   `/admin/orgs/<org>` → "Unprocessed Stripe events" → Replay. This runs the
   exact same code path a live delivery takes — not a parallel one.
3. **For events Stripe has given up on** (or that predate a database restore):
   Stripe dashboard → Developers → Webhooks → the endpoint → Resend for the
   affected events. The idempotency ledger makes double-sends safe.
4. **Verify the money state**, not the event count: for each affected org, check
   `subscriptions.status` against Stripe's own subscription list. The reconcile
   cron (`/api/cron/stripe-reconcile`) does this nightly; run it manually with
   the cron secret to force a check.

## If the signing secret rotated

`STRIPE_WEBHOOK_SECRET` must match the endpoint's secret in Stripe. A mismatch
means every delivery fails signature verification and is rejected — correctly,
and loudly. Update the env var, redeploy, then resend from Stripe.

## Do not

- Do not disable signature verification "temporarily". A webhook endpoint without
  it is an unauthenticated write into money state.
- Do not hand-edit `subscriptions` to "catch up". Replay the events; the state
  machine exists so the state is derived, not typed in.
