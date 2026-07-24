import { expect, test } from "@playwright/test";

import { CARD_BANK, cardByKind } from "@/lib/cards/bank";
import { MAX_PER_DAY, MAX_PER_WEEK, pickCard, type CardGaps } from "@/lib/cards/picker";

// Phase 6.5 — the smart check-in picker (pure; no DB). It fills DATA GAPS and
// never spams: at most 1 card/day, 3/week, never during quiet hours, and nothing
// when there's no gap. A bug here either nags a real person or misses the client
// who's slipping — so the caps + gap ranking are fixtured exhaustively.

const noGaps: CardGaps = { noSleepDays: 0, adherenceDropped: false, deloadWeek: false, nonLogger: false };
const base = { gaps: noGaps, sentToday: 0, sentThisWeek: 0, isQuietHours: false };

test("caps: quiet hours, the daily cap, and the weekly cap each suppress the card", () => {
  const withGap = { ...base, gaps: { ...noGaps, noSleepDays: 6 } };
  expect(pickCard(withGap)).not.toBeNull(); // baseline: a gap would send
  expect(pickCard({ ...withGap, isQuietHours: true })).toBeNull();
  expect(pickCard({ ...withGap, sentToday: MAX_PER_DAY })).toBeNull();
  expect(pickCard({ ...withGap, sentThisWeek: MAX_PER_WEEK })).toBeNull();
});

test("no gap → no card (never spam a client who's giving us data)", () => {
  expect(pickCard(base)).toBeNull();
});

test("gap ranking: non-logger > no-sleep > adherence-drop > deload", () => {
  // Non-logger wins even alongside other gaps.
  expect(pickCard({ ...base, gaps: { noSleepDays: 6, adherenceDropped: true, deloadWeek: true, nonLogger: true } })?.kind).toBe(
    "questionnaire",
  );
  expect(pickCard({ ...base, gaps: { ...noGaps, noSleepDays: 6 } })?.kind).toBe("sleep");
  expect(pickCard({ ...base, gaps: { ...noGaps, adherenceDropped: true } })?.kind).toBe("motivation");
  expect(pickCard({ ...base, gaps: { ...noGaps, deloadWeek: true } })?.kind).toBe("soreness");
});

test("the no-sleep gap only fires after a real gap (≥5 days), not on day 1", () => {
  expect(pickCard({ ...base, gaps: { ...noGaps, noSleepDays: 2 } })).toBeNull();
  expect(pickCard({ ...base, gaps: { ...noGaps, noSleepDays: 5 } })?.kind).toBe("sleep");
});

test("the card bank covers the spec's kinds and every card is answerable", () => {
  for (const kind of ["sleep", "stress", "soreness", "energy", "motivation", "weekend_plan", "travel", "questionnaire"] as const) {
    expect(cardByKind(kind), `bank has a ${kind} card`).toBeTruthy();
  }
  for (const c of CARD_BANK) {
    expect(c.question.length).toBeGreaterThan(0);
    if (c.answerType === "choice") expect((c.options ?? []).length).toBeGreaterThan(1);
  }
});
