import { expect, test } from "@playwright/test";

import { transition } from "@/lib/payments/state-machine";
import type { Effect, SubState, WebhookEvent, WebhookEventType } from "@/lib/payments/webhook-types";

// Phase 8.3 — the webhook state machine. TDD, fixtures FIRST. transition() is a
// PURE function: (currentState, event) → {newState, effects[]}. Everything money-
// correctness-critical lives here where it can be exhaustively tested with no
// live Stripe. 25 lifecycle fixtures incl. replay/out-of-order + dispute + Connect
// deauthorization. The route only signature-verifies, dedupes by event id, and
// executes the effects transactionally with the state write.

const base: SubState = {
  exists: true,
  status: "active",
  pauseReason: "none",
  dunningStage: 0,
  cancelAtPeriodEnd: false,
  lastEventAt: 1000,
};
const S = (o: Partial<SubState> = {}): SubState => ({ ...base, ...o });
const E = (type: WebhookEventType, o: Partial<WebhookEvent> = {}): WebhookEvent => ({
  type,
  created: 2000,
  ...o,
});

function effectKinds(effects: Effect[]): string[] {
  return effects.map((e) => e.kind);
}
function findEffect<K extends Effect["kind"]>(effects: Effect[], kind: K) {
  return effects.find((e) => e.kind === kind) as Extract<Effect, { kind: K }> | undefined;
}

// ── 1. first checkout → active + welcome ──────────────────────────────────────
test("checkout.session.completed activates a new subscription + welcomes", () => {
  const { newState, effects } = transition(
    S({ exists: false, status: "incomplete", lastEventAt: null }),
    E("checkout.session.completed", {
      stripeSubscriptionId: "sub_1",
      stripeCustomerId: "cus_1",
      tierId: "tier_1",
      currentPeriodEnd: 5000,
    }),
  );
  expect(newState.exists).toBe(true);
  expect(newState.status).toBe("active");
  expect(newState.lastEventAt).toBe(2000);
  expect(effectKinds(effects)).toContain("upsert_subscription");
  expect(findEffect(effects, "set_client_status")?.status).toBe("active");
  expect(findEffect(effects, "notify_client")?.template).toBe("welcome");
  expect(effectKinds(effects)).toContain("audit");
});

// ── 2. renewal invoice.paid while active → records payment ─────────────────────
test("invoice.paid on an active sub records the payment (with app fee)", () => {
  const { newState, effects } = transition(
    S(),
    E("invoice.paid", {
      invoiceId: "in_1",
      amountCents: 10000,
      applicationFeeCents: 250,
      currency: "usd",
      periodStart: 2000,
      periodEnd: 5000,
    }),
  );
  expect(newState.status).toBe("active");
  const pay = findEffect(effects, "record_payment");
  expect(pay?.status).toBe("paid");
  expect(pay?.amountCents).toBe(10000);
  expect(pay?.applicationFeeCents).toBe(250);
  // A clean renewal never re-welcomes.
  expect(effectKinds(effects)).not.toContain("notify_client");
});

// ── 3. first payment failure → past_due + dunning stage 1 + nudge + flag ───────
test("invoice.payment_failed → past_due, dunning stage 1, client nudge + trainer flag", () => {
  const { newState, effects } = transition(
    S(),
    E("invoice.payment_failed", { invoiceId: "in_2", amountCents: 10000, currency: "usd" }),
  );
  expect(newState.status).toBe("past_due");
  expect(newState.pauseReason).toBe("dunning");
  expect(newState.dunningStage).toBe(1);
  expect(findEffect(effects, "notify_client")?.template).toBe("payment_failed");
  expect(findEffect(effects, "flag_trainer")?.flag).toBe("payment_failed");
  expect(findEffect(effects, "record_payment")?.status).toBe("failed");
});

// ── 4. recovery: invoice.paid after failure → active + gap-fairness ────────────
test("invoice.paid after a failure clears dunning, reactivates, marks the gap not-expected", () => {
  const { newState, effects } = transition(
    S({ status: "past_due", pauseReason: "dunning", dunningStage: 2 }),
    E("invoice.paid", { invoiceId: "in_3", amountCents: 10000, applicationFeeCents: 250, currency: "usd" }),
  );
  expect(newState.status).toBe("active");
  expect(newState.pauseReason).toBe("none");
  expect(newState.dunningStage).toBe(0);
  expect(findEffect(effects, "notify_client")?.template).toBe("payment_recovered");
  expect(findEffect(effects, "set_client_status")?.status).toBe("active");
  // Ledger gap-fairness: a payment gap is never a "missed" day.
  expect(effectKinds(effects)).toContain("ledger_mark_gap_not_expected");
});

// ── 5. second failure → dunning stage 2 ───────────────────────────────────────
test("a second payment_failed advances dunning to stage 2", () => {
  const { newState } = transition(
    S({ status: "past_due", pauseReason: "dunning", dunningStage: 1 }),
    E("invoice.payment_failed", { created: 3000 }),
  );
  expect(newState.dunningStage).toBe(2);
});

// ── 6. third failure → stage caps at 3 ────────────────────────────────────────
test("dunning stage caps at 3 (never runs away)", () => {
  const { newState } = transition(
    S({ status: "past_due", pauseReason: "dunning", dunningStage: 3 }),
    E("invoice.payment_failed", { created: 4000 }),
  );
  expect(newState.dunningStage).toBe(3);
});

// ── 7. subscription.updated → past_due enters dunning ─────────────────────────
test("customer.subscription.updated to past_due enters dunning", () => {
  const { newState } = transition(S(), E("customer.subscription.updated", { subscriptionStatus: "past_due" }));
  expect(newState.status).toBe("past_due");
  expect(newState.pauseReason).toBe("dunning");
  expect(newState.dunningStage).toBeGreaterThanOrEqual(1);
});

// ── 8. subscription.updated → active clears dunning ───────────────────────────
test("customer.subscription.updated back to active clears dunning", () => {
  const { newState } = transition(
    S({ status: "past_due", pauseReason: "dunning", dunningStage: 2 }),
    E("customer.subscription.updated", { subscriptionStatus: "active" }),
  );
  expect(newState.status).toBe("active");
  expect(newState.pauseReason).toBe("none");
  expect(newState.dunningStage).toBe(0);
});

// ── 9. subscription.deleted → canceled + churned ──────────────────────────────
test("customer.subscription.deleted cancels + churns the client", () => {
  const { newState, effects } = transition(S(), E("customer.subscription.deleted"));
  expect(newState.status).toBe("canceled");
  expect(findEffect(effects, "set_client_status")?.status).toBe("churned");
  expect(findEffect(effects, "notify_client")?.template).toBe("subscription_canceled");
});

// ── 10. subscription.paused (vacation) ────────────────────────────────────────
test("customer.subscription.paused → paused/vacation, client paused", () => {
  const { newState, effects } = transition(S(), E("customer.subscription.paused"));
  expect(newState.status).toBe("paused");
  expect(newState.pauseReason).toBe("vacation");
  expect(findEffect(effects, "set_client_status")?.status).toBe("paused");
});

// ── 11. subscription.resumed → active ─────────────────────────────────────────
test("customer.subscription.resumed → active", () => {
  const { newState, effects } = transition(
    S({ status: "paused", pauseReason: "vacation" }),
    E("customer.subscription.resumed"),
  );
  expect(newState.status).toBe("active");
  expect(newState.pauseReason).toBe("none");
  expect(findEffect(effects, "set_client_status")?.status).toBe("active");
});

// ── 12. account.updated → connect status (no subscription mutation) ───────────
test("account.updated emits connect status, leaves subscription state untouched", () => {
  const before = S({ status: "past_due" });
  const { newState, effects } = transition(before, E("account.updated", { chargesEnabled: true, payoutsEnabled: true }));
  expect(newState.status).toBe("past_due"); // unchanged
  const cs = findEffect(effects, "set_connect_status");
  expect(cs?.chargesEnabled).toBe(true);
  expect(cs?.payoutsEnabled).toBe(true);
});

// ── 13. charge.dispute.created → flag trainer + admin ─────────────────────────
test("charge.dispute.created flags the trainer + platform admin, status unchanged", () => {
  const { newState, effects } = transition(S(), E("charge.dispute.created", { disputeId: "dp_1" }));
  expect(newState.status).toBe("active");
  expect(findEffect(effects, "flag_trainer")?.flag).toBe("dispute");
  expect(findEffect(effects, "flag_platform_admin")?.reason).toBe("dispute");
});

// ── 14. account.application.deauthorized → connect deauthorized flag ──────────
test("account.application.deauthorized flags trainer + admin", () => {
  const { effects } = transition(S(), E("account.application.deauthorized"));
  expect(findEffect(effects, "flag_trainer")?.flag).toBe("connect_deauthorized");
  expect(findEffect(effects, "flag_platform_admin")?.reason).toBe("connect_deauthorized");
});

// ── 15. out-of-order: a stale subscription-scoped event is skipped ────────────
test("a stale event (created < lastEventAt) is skipped, state unchanged", () => {
  const before = S({ status: "active", lastEventAt: 5000 });
  const { newState, effects } = transition(
    before,
    E("customer.subscription.deleted", { created: 3000 }),
  );
  expect(newState.status).toBe("active"); // NOT canceled
  expect(newState).toEqual(before);
  expect(effectKinds(effects)).toEqual(["audit"]);
});

// ── 16. out-of-order pair: newer wins, older skipped ──────────────────────────
test("apply newer then older: the older delivery does not overwrite", () => {
  const t1 = transition(
    S({ status: "past_due", pauseReason: "dunning", dunningStage: 1, lastEventAt: 1000 }),
    E("customer.subscription.updated", { created: 5000, subscriptionStatus: "active" }),
  );
  expect(t1.newState.status).toBe("active");
  expect(t1.newState.lastEventAt).toBe(5000);
  const t2 = transition(
    t1.newState,
    E("customer.subscription.updated", { created: 4000, subscriptionStatus: "past_due" }),
  );
  expect(t2.newState.status).toBe("active"); // stale, ignored
});

// ── 17. idempotent re-checkout on an already-active sub → no double welcome ────
test("checkout.session.completed on an existing active sub does not re-welcome", () => {
  const { effects } = transition(
    S({ exists: true, status: "active" }),
    E("checkout.session.completed", { stripeSubscriptionId: "sub_1", created: 3000 }),
  );
  expect(effectKinds(effects)).not.toContain("notify_client");
  expect(effectKinds(effects)).toContain("upsert_subscription");
});

// ── 18. fail → dunning → cancel ───────────────────────────────────────────────
test("a dunning subscription that gets deleted → canceled + churned", () => {
  const { newState, effects } = transition(
    S({ status: "past_due", pauseReason: "dunning", dunningStage: 3 }),
    E("customer.subscription.deleted", { created: 6000 }),
  );
  expect(newState.status).toBe("canceled");
  expect(findEffect(effects, "set_client_status")?.status).toBe("churned");
});

// ── 19. cancel_at_period_end flag ─────────────────────────────────────────────
test("customer.subscription.updated cancel_at_period_end keeps status active, sets the flag", () => {
  const { newState } = transition(
    S(),
    E("customer.subscription.updated", { subscriptionStatus: "active", cancelAtPeriodEnd: true }),
  );
  expect(newState.status).toBe("active");
  expect(newState.cancelAtPeriodEnd).toBe(true);
});

// ── 20. subscription.updated advances the current period end ──────────────────
test("customer.subscription.updated carries the new current_period_end into the upsert", () => {
  const { effects } = transition(
    S(),
    E("customer.subscription.updated", { subscriptionStatus: "active", currentPeriodEnd: 9999 }),
  );
  expect(findEffect(effects, "upsert_subscription")?.currentPeriodEnd).toBe(9999);
});

// ── 21. account.updated with payouts disabled ─────────────────────────────────
test("account.updated reports payouts disabled honestly", () => {
  const { effects } = transition(S(), E("account.updated", { chargesEnabled: true, payoutsEnabled: false }));
  expect(findEffect(effects, "set_connect_status")?.payoutsEnabled).toBe(false);
});

// ── 22. subscription.deleted from a vacation pause → canceled ──────────────────
test("a paused (vacation) subscription that is deleted → canceled + churned", () => {
  const { newState, effects } = transition(
    S({ status: "paused", pauseReason: "vacation" }),
    E("customer.subscription.deleted"),
  );
  expect(newState.status).toBe("canceled");
  expect(findEffect(effects, "set_client_status")?.status).toBe("churned");
});

// ── 23. every subscription-scoped transition advances lastEventAt ─────────────
test("applying a fresh event advances lastEventAt to the event's created time", () => {
  const { newState } = transition(S({ lastEventAt: 1000 }), E("invoice.paid", { created: 7777, amountCents: 1, applicationFeeCents: 0, currency: "usd" }));
  expect(newState.lastEventAt).toBe(7777);
});

// ── 24. unpaid status enters dunning too ──────────────────────────────────────
test("customer.subscription.updated to unpaid enters dunning", () => {
  const { newState } = transition(S(), E("customer.subscription.updated", { subscriptionStatus: "unpaid" }));
  expect(newState.status).toBe("unpaid");
  expect(newState.pauseReason).toBe("dunning");
});

// ── 25. recovery from unpaid via invoice.paid restores access + gap-fairness ───
test("invoice.paid recovering from unpaid restores active + marks gap not-expected", () => {
  const { newState, effects } = transition(
    S({ status: "unpaid", pauseReason: "dunning", dunningStage: 3 }),
    E("invoice.paid", { amountCents: 10000, applicationFeeCents: 250, currency: "usd" }),
  );
  expect(newState.status).toBe("active");
  expect(newState.dunningStage).toBe(0);
  expect(effectKinds(effects)).toContain("ledger_mark_gap_not_expected");
});
