import { expect, test } from "@playwright/test";

import { computeExpectations, type DayInputs } from "@/lib/ledger/day-close";
import { DEFAULT_DUNNING, graceExpired, graceUntil, systemMessage } from "@/lib/payments/dunning";
import { transition } from "@/lib/payments/state-machine";
import type { Effect, SubState, WebhookEventType, WebhookEvent } from "@/lib/payments/webhook-types";

// Phase 8.4 — dunning ladder + pause states. The money-fairness core: a payment
// gap is NEVER a missed day, the ladder escalates then the SYSTEM pauses the plan
// (trainer never chases), and recovery reinstates everything.

const S = (o: Partial<SubState> = {}): SubState => ({
  exists: true, status: "active", pauseReason: "none", dunningStage: 0,
  cancelAtPeriodEnd: false, lastEventAt: 1000, ...o,
});
const E = (type: WebhookEventType, o: Partial<WebhookEvent> = {}): WebhookEvent => ({ type, created: 2000, ...o });
const kinds = (e: Effect[]) => e.map((x) => x.kind);
const find = <K extends Effect["kind"]>(e: Effect[], k: K) => e.find((x) => x.kind === k) as Extract<Effect, { kind: K }> | undefined;

const dayInputs = (o: Partial<DayInputs> = {}): DayInputs => ({
  status: "active",
  plan: { mealSlots: ["breakfast", "lunch", "dinner"] },
  isTrainingDay: true,
  isWeighInDay: true,
  actual: { mealSlots: [], mealCount: 0, weighIn: false, checkin: false, sets: false },
  ...o,
});

// ── gap-fairness ──────────────────────────────────────────────────────────────
test("a payment gap suppresses all expectations (never a missed day)", () => {
  const exp = computeExpectations(dayInputs({ paymentGap: true }));
  expect(exp.mode).toBe("none");
  expect(exp.weighIn).toBe(false);
  expect(exp.sets).toBe(false);
});

test("an active client with NO payment gap still accrues real expectations", () => {
  const exp = computeExpectations(dayInputs({ paymentGap: false }));
  expect(exp.mode).toBe("plan");
  expect(exp.mealSlots).toEqual(["breakfast", "lunch", "dinner"]);
});

// ── the ladder ────────────────────────────────────────────────────────────────
test("stage 2 (a mid-ladder retry) nudges, does not pause", () => {
  const { newState, effects } = transition(
    S({ status: "past_due", pauseReason: "dunning", dunningStage: 1 }),
    E("invoice.payment_failed", { created: 3000, amountCents: 10000, currency: "usd" }),
  );
  expect(newState.dunningStage).toBe(2);
  expect(find(effects, "notify_client")?.template).toBe("payment_failed");
  expect(kinds(effects)).not.toContain("set_client_status");
});

test("stage 3 (final retry) pauses the plan + flags the trainer, system-voiced", () => {
  const { newState, effects } = transition(
    S({ status: "past_due", pauseReason: "dunning", dunningStage: 2 }),
    E("invoice.payment_failed", { created: 4000, amountCents: 10000, currency: "usd" }),
  );
  expect(newState.dunningStage).toBe(3);
  expect(find(effects, "set_client_status")?.status).toBe("paused");
  expect(find(effects, "notify_client")?.template).toBe("plan_paused");
  expect(find(effects, "flag_trainer")?.flag).toBe("payment_failed");
});

test("recovery from a paused dunning state reactivates the client", () => {
  const { newState, effects } = transition(
    S({ status: "past_due", pauseReason: "dunning", dunningStage: 3 }),
    E("invoice.paid", { amountCents: 10000, applicationFeeCents: 250, currency: "usd" }),
  );
  expect(newState.status).toBe("active");
  expect(newState.dunningStage).toBe(0);
  expect(find(effects, "set_client_status")?.status).toBe("active");
  expect(find(effects, "notify_client")?.template).toBe("payment_recovered");
});

// ── system voice (trainer never chases) ──────────────────────────────────────
test("dunning copy is system-voiced — about the plan/payment, never the coach", () => {
  const paused = systemMessage("plan_paused");
  expect(paused.body.toLowerCase()).toContain("paused");
  expect(paused.cta).toBe("Update payment to resume");
  // Never first-person / coach voice.
  expect(paused.body).not.toMatch(/\bI\b|\bme\b|\bmy\b|you owe/i);
  expect(systemMessage("payment_failed").body).not.toMatch(/you owe/i);
});

// ── order-independence (review fix M3) ───────────────────────────────────────
test("dunning stage follows Stripe's attempt_count, not our event count", () => {
  // A single failed retry #2 lands stage 2 directly, even from stage 0.
  const { newState } = transition(
    S(),
    E("invoice.payment_failed", { attemptCount: 2, amountCents: 10000, currency: "usd" }),
  );
  expect(newState.dunningStage).toBe(2);
});

test("a paired subscription.updated(past_due) does NOT double-advance the ladder", () => {
  // updated arrives first (floors to stage 1)...
  const t1 = transition(S(), E("customer.subscription.updated", { created: 3000, subscriptionStatus: "past_due" }));
  expect(t1.newState.dunningStage).toBe(1);
  // ...then the paired payment_failed with attempt_count 1 keeps it at 1, not 2.
  const t2 = transition(t1.newState, E("invoice.payment_failed", { created: 3001, attemptCount: 1, amountCents: 10000, currency: "usd" }));
  expect(t2.newState.dunningStage).toBe(1);
});

test("recovery via subscription.updated(active) still fires recovered + gap-fairness", () => {
  const { newState, effects } = transition(
    S({ status: "past_due", pauseReason: "dunning", dunningStage: 2 }),
    E("customer.subscription.updated", { subscriptionStatus: "active" }),
  );
  expect(newState.status).toBe("active");
  expect(find(effects, "notify_client")?.template).toBe("payment_recovered");
  expect(kinds(effects)).toContain("ledger_mark_gap_not_expected");
});

test("gap-fairness only suppresses at the FINAL dunning stage, not the early window", () => {
  // Stage 1 (day-0 retry) → client still has access → still accrues expectations.
  // (day-close-job passes paymentGap only for stage>=3/unpaid/paused; this asserts
  // the pure computeExpectations honors the flag exactly.)
  expect(computeExpectations(dayInputs({ paymentGap: false })).mode).toBe("plan");
  expect(computeExpectations(dayInputs({ paymentGap: true })).mode).toBe("none");
});

// ── grace helpers ─────────────────────────────────────────────────────────────
test("grace window helpers compute + expire correctly", () => {
  const now = new Date("2026-08-01T00:00:00.000Z");
  const until = graceUntil(now, DEFAULT_DUNNING.graceDays);
  expect(graceExpired(until, now)).toBe(false);
  expect(graceExpired(until, new Date("2026-08-09T00:00:00.000Z"))).toBe(true);
  expect(graceExpired(null, now)).toBe(false);
});
