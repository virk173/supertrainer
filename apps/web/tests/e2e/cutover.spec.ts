import { expect, test } from "@playwright/test";

import { cutoverStatus, summarizeCutover, type CutoverState } from "@/lib/payments/cutover-state";

// Phase 8.6 — the beta cutover state machine, pure + tested. Nobody is hard-cut:
// full access through the grace window, then the dunning restricted state.

const now = new Date("2026-08-15T00:00:00.000Z");
const future = "2026-08-30T00:00:00.000Z";
const past = "2026-08-01T00:00:00.000Z";

test("an approved_manually client with no subscription → not_started", () => {
  expect(cutoverStatus({ approvedManually: true, subStatus: null, graceUntil: null, now })).toBe("not_started");
});

test("cutover started, within the capture window → in_grace (full access)", () => {
  expect(cutoverStatus({ approvedManually: true, subStatus: "incomplete", graceUntil: future, now })).toBe("in_grace");
});

test("checkout completed → captured", () => {
  expect(cutoverStatus({ approvedManually: false, subStatus: "active", graceUntil: past, now })).toBe("captured");
});

test("capture window elapsed, still unpaid → expired (hands to dunning)", () => {
  expect(cutoverStatus({ approvedManually: true, subStatus: "incomplete", graceUntil: past, now })).toBe("expired");
});

test("a past_due (dunning) cutover client is expired/uncaptured", () => {
  expect(cutoverStatus({ approvedManually: true, subStatus: "past_due", graceUntil: past, now })).toBe("expired");
});

test("progress aggregates the org's cutover", () => {
  const states: CutoverState[] = ["not_started", "not_started", "in_grace", "captured", "captured", "expired"];
  expect(summarizeCutover(states)).toEqual({
    notStarted: 2,
    inGrace: 1,
    captured: 2,
    expired: 1,
    total: 6,
  });
});
