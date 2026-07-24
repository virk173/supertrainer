import { expect, test } from "@playwright/test";

import { remainingMacros, type Macros } from "@/lib/comms/numbers";

// Phase 6.4 — the "real numbers in code" lane (CLAUDE.md rule 4: no LLM
// arithmetic). Remaining macros = today's plan target − today's logged intake,
// computed HERE. The autonomous/draft copy only ever wraps these numbers; the
// model never produces them, so a hallucinated macro can't reach a client.

const target: Macros = { kcal: 2200, protein: 180, carbs: 200, fat: 70 };

test("remaining = target − logged, per macro", () => {
  const logged: Macros = { kcal: 1400, protein: 120, carbs: 130, fat: 40 };
  expect(remainingMacros(target, logged)).toEqual({ kcal: 800, protein: 60, carbs: 70, fat: 30 });
});

test("nothing logged yet → the whole target remains", () => {
  expect(remainingMacros(target, { kcal: 0, protein: 0, carbs: 0, fat: 0 })).toEqual(target);
});

test("over target floors at zero — never a negative 'remaining'", () => {
  const logged: Macros = { kcal: 2500, protein: 200, carbs: 260, fat: 90 };
  expect(remainingMacros(target, logged)).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
});

test("results are rounded integers (no floating-point crumbs in client copy)", () => {
  const t: Macros = { kcal: 2000, protein: 150.4, carbs: 180.6, fat: 60.5 };
  const l: Macros = { kcal: 999.9, protein: 100.1, carbs: 50.2, fat: 20.3 };
  const r = remainingMacros(t, l);
  for (const v of Object.values(r)) expect(Number.isInteger(v)).toBe(true);
  expect(r.kcal).toBe(1000);
});
