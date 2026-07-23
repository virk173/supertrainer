import { expect, test } from "@playwright/test";

import {
  REMINDER_PRIORITY,
  decideReminders,
  isQuietHours,
  type DecideInputs,
  type ReminderKind,
} from "../../lib/reminders/decide";

// Phase 3.6 — reminder decision engine (TDD, written first). This is where a bug
// means spamming a real person, so the rules are pure and exhaustively fixtured:
// quiet-hours deferral, the 3/day cap by priority, already-logged suppression,
// and the vacation/paused kill switch.

function inputs(over: Partial<DecideInputs> = {}): DecideInputs {
  return {
    now: { localTime: "12:00" },
    candidates: [{ kind: "meal", scheduledLocalTime: "12:00" }],
    quietHours: { start: "21:30", end: "07:30" },
    enabled: true,
    paused: false,
    satisfied: { meal: false, weigh_in: false, checkin: false, custom: false },
    sentToday: 0,
    cap: 3,
    ...over,
  };
}

// ── Quiet hours (wrap around midnight) ────────────────────────────────────────
test("isQuietHours handles the wrap-around 21:30 → 07:30 window", () => {
  const q = { start: "21:30", end: "07:30" };
  expect(isQuietHours("22:00", q)).toBe(true);
  expect(isQuietHours("06:00", q)).toBe(true);
  expect(isQuietHours("21:30", q)).toBe(true); // inclusive start
  expect(isQuietHours("21:29", q)).toBe(false);
  expect(isQuietHours("07:30", q)).toBe(false); // exclusive end
  expect(isQuietHours("12:00", q)).toBe(false);
});

test("isQuietHours handles a same-day window (13:00 → 14:00)", () => {
  const q = { start: "13:00", end: "14:00" };
  expect(isQuietHours("13:30", q)).toBe(true);
  expect(isQuietHours("12:59", q)).toBe(false);
  expect(isQuietHours("14:00", q)).toBe(false);
});

test("during quiet hours every due reminder is deferred, none sent", () => {
  const r = decideReminders(inputs({ now: { localTime: "22:00" }, candidates: [
    { kind: "meal", scheduledLocalTime: "22:00" },
    { kind: "weigh_in", scheduledLocalTime: "22:00" },
  ] }));
  expect(r.send).toEqual([]);
  expect(r.deferred).toEqual(["meal", "weigh_in"]);
});

// ── Already-logged suppression ────────────────────────────────────────────────
test("never reminds for an expectation already satisfied", () => {
  const r = decideReminders(inputs({
    candidates: [{ kind: "meal", scheduledLocalTime: "12:00" }],
    satisfied: { meal: true, weigh_in: false, checkin: false, custom: false },
  }));
  expect(r.send).toEqual([]);
  expect(r.suppressed).toContain("meal");
});

// ── 3/day cap by priority ─────────────────────────────────────────────────────
test("priority order is meals > weigh-in > check-in > custom", () => {
  expect(REMINDER_PRIORITY).toEqual(["meal", "weigh_in", "checkin", "custom"]);
});

test("caps at 3 nudges/day, dropping the lowest priority over the cap", () => {
  const r = decideReminders(inputs({
    candidates: [
      { kind: "checkin", scheduledLocalTime: "12:00" },
      { kind: "custom", scheduledLocalTime: "12:00" },
      { kind: "meal", scheduledLocalTime: "12:00" },
      { kind: "weigh_in", scheduledLocalTime: "12:00" },
    ],
  }));
  expect(r.send).toEqual(["meal", "weigh_in", "checkin"]); // custom over the cap
  expect(r.suppressed).toContain("custom");
});

test("the cap counts nudges already sent today", () => {
  const r = decideReminders(inputs({
    sentToday: 2,
    candidates: [
      { kind: "meal", scheduledLocalTime: "12:00" },
      { kind: "weigh_in", scheduledLocalTime: "12:00" },
    ],
  }));
  expect(r.send).toEqual(["meal"]); // only 1 slot left
});

test("already at the daily cap sends nothing", () => {
  const r = decideReminders(inputs({ sentToday: 3, candidates: [{ kind: "meal", scheduledLocalTime: "12:00" }] }));
  expect(r.send).toEqual([]);
});

// ── Kill switch / paused ──────────────────────────────────────────────────────
test("vacation mode (disabled) sends nothing", () => {
  expect(decideReminders(inputs({ enabled: false })).send).toEqual([]);
});

test("a paused client is never reminded", () => {
  expect(decideReminders(inputs({ paused: true })).send).toEqual([]);
});

// ── Happy path ────────────────────────────────────────────────────────────────
test("outside quiet hours, under the cap, unsatisfied -> the reminder sends", () => {
  const r = decideReminders(inputs());
  expect(r.send).toEqual(["meal"]);
});

test("a mix: one satisfied, one due -> only the due one sends", () => {
  const r = decideReminders(inputs({
    candidates: [
      { kind: "meal", scheduledLocalTime: "12:00" },
      { kind: "weigh_in", scheduledLocalTime: "12:00" },
    ],
    satisfied: { meal: true, weigh_in: false, checkin: false, custom: false },
  }));
  expect(r.send).toEqual(["weigh_in"]);
  expect(r.suppressed).toContain("meal");
});
