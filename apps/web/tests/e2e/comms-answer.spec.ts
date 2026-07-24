import { expect, test } from "@playwright/test";

import { autonomousReply, computeAutonomousAnswer, replyNumbersAreGrounded } from "@/lib/comms/answer";
import type { ClientContext } from "@/lib/comms/context";

// Phase 6.4 — the autonomous lane. computeAutonomousAnswer picks a code-computed
// fact; autonomousReply phrases it but re-validates that the copy introduces no
// number the fact didn't have (validate-after — a hallucinated macro can't reach
// the client). No model here; the wrap is injected.

function ctx(over: Partial<ClientContext> = {}): ClientContext {
  return {
    clientId: "c",
    orgId: "o",
    timezone: "UTC",
    todayDayType: "standard",
    target: { kcal: 2200, protein: 180, carbs: 200, fat: 70 },
    logged: { kcal: 1400, protein: 120, carbs: 130, fat: 40 },
    remaining: { kcal: 800, protein: 60, carbs: 70, fat: 30 },
    fastWindow: { start: "12:00", end: "20:00" },
    mealSlots: ["breakfast", "lunch", "dinner"],
    adherenceScore: 82,
    band: "locked_in",
    streak: 5,
    todaySession: { label: "Push", exercises: ["Bench Press"] },
    nextSessionLabel: "Pull",
    recentMessages: [],
    ...over,
  };
}

test("picks the remaining-macros fact for a macro question (coded numbers)", () => {
  const fact = computeAutonomousAnswer(ctx(), "how many carbs do I have left today?");
  expect(fact?.kind).toBe("macros");
  expect(fact?.fact).toContain("carbs 70g");
  expect(fact?.fact).toContain("kcal 800");
});

test("picks the session fact and the eating-window fact", () => {
  expect(computeAutonomousAnswer(ctx(), "when's my next workout?")?.kind).toBe("next_session");
  expect(computeAutonomousAnswer(ctx({ todaySession: null }), "what's my next session?")?.fact).toContain("Pull");
  expect(computeAutonomousAnswer(ctx(), "when's my eating window?")?.kind).toBe("eating_window");
});

test("returns null when no coded fact matches (→ the caller drafts instead)", () => {
  expect(computeAutonomousAnswer(ctx(), "how do I stay motivated?")).toBeNull();
});

test("a grounded wrap is used verbatim", async () => {
  const wrap = async () => "You've got 70g of carbs and 800 kcal left today — nice work!";
  const out = await autonomousReply(ctx(), "carbs left?", { wrap });
  expect(out?.reply).toContain("70g of carbs");
});

test("a wrap that invents a number is REJECTED — falls back to the plain coded fact", async () => {
  const wrap = async () => "You have about 9999 kcal left, go wild!"; // 9999 is not in the fact
  const out = await autonomousReply(ctx(), "carbs left?", { wrap });
  expect(out?.reply).toBe(out?.fact.fact); // fell back
  expect(out?.reply).not.toContain("9999");
  expect(out?.reply).toContain("carbs 70g");
});

test("a wrap outage falls back to the plain coded fact (still correct numbers)", async () => {
  const wrap = async () => {
    throw new Error("model down");
  };
  const out = await autonomousReply(ctx(), "carbs left?", { wrap });
  expect(out?.reply).toContain("carbs 70g");
});

test("replyNumbersAreGrounded is the guard: reply numbers ⊆ fact numbers", () => {
  expect(replyNumbersAreGrounded("remaining: 70g carbs, 800 kcal", "you have 70g carbs and 800 kcal")).toBe(true);
  expect(replyNumbersAreGrounded("remaining: 70g carbs", "you have 70g carbs in 2 meals")).toBe(false); // 2 invented
});
