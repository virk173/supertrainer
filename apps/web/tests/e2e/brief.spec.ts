import { expect, test } from "@playwright/test";

import { serializeIntakeForBrief, summarizeHealthFlags } from "../../lib/interview/brief";

// PO-5 — pure helpers that keep the brief's safety-critical parts code-derived
// (node-level, no browser, no AI).

test("summarizeHealthFlags surfaces allergens and interview disclosures authoritatively", () => {
  expect(summarizeHealthFlags({ allergies: ["Peanuts", "Shellfish"] })).toEqual([
    "Allergy: Peanuts",
    "Allergy: Shellfish",
  ]);

  expect(
    summarizeHealthFlags({
      allergies: ["Peanuts"],
      interview: { categories: ["condition", "medication"] },
    }),
  ).toEqual([
    "Allergy: Peanuts",
    "Medical condition disclosed",
    "Medication disclosed",
  ]);

  // Unknown category still surfaces (fail-open on visibility, never silent).
  expect(summarizeHealthFlags({ interview: { categories: ["mystery"] } })).toEqual([
    "Health flag: mystery",
  ]);

  // Malformed / empty shapes never throw and yield nothing.
  expect(summarizeHealthFlags(null)).toEqual([]);
  expect(summarizeHealthFlags(undefined)).toEqual([]);
  expect(summarizeHealthFlags({})).toEqual([]);
  expect(summarizeHealthFlags({ allergies: "not-an-array" })).toEqual([]);
});

test("serializeIntakeForBrief renders captured fields and skips bookkeeping keys", () => {
  const out = serializeIntakeForBrief({
    name: "Sam",
    goal: "build muscle",
    stage_b: {
      nutrition: { mealsPerDay: 4, mealTimes: ["08:00", "13:00"] },
      training: { daysPerWeek: 5 },
    },
    stage_b_completed_at: "2026-07-21T00:00:00.000Z",
  });

  expect(out).toContain("name: Sam");
  expect(out).toContain("goal: build muscle");
  expect(out).toContain("stage_b.nutrition.mealsPerDay: 4");
  expect(out).toContain("stage_b.nutrition.mealTimes: 08:00, 13:00");
  expect(out).toContain("stage_b.training.daysPerWeek: 5");
  // Derived bookkeeping key is excluded so the model isn't grounded on it.
  expect(out).not.toContain("stage_b_completed_at");
});

test("serializeIntakeForBrief omits empty values and is bounded", () => {
  const out = serializeIntakeForBrief({ goal: "", note: null, tags: [], keep: "yes" });
  expect(out).toBe("keep: yes");

  const huge = serializeIntakeForBrief({ big: "x".repeat(10000) });
  expect(huge.length).toBeLessThanOrEqual(4000);
});
