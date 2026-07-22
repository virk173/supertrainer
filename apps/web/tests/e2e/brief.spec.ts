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

test("serializeIntakeForBrief renders coaching answers but drops PII/internal keys", () => {
  const out = serializeIntakeForBrief({
    name: "Sam",
    email: "sam@example.com",
    phone: "+1 555 0100",
    selected_tier_id: "tier-uuid-1234",
    goal: "build muscle",
    stage_b: {
      nutrition: { mealsPerDay: 4, mealTimes: ["08:00", "13:00"] },
      training: { daysPerWeek: 5 },
      contact: { email: "nested@example.com" }, // dropped even nested
    },
    stage_b_completed_at: "2026-07-21T00:00:00.000Z",
  });

  expect(out).toContain("goal: build muscle");
  expect(out).toContain("stage_b.nutrition.mealsPerDay: 4");
  expect(out).toContain("stage_b.nutrition.mealTimes: 08:00, 13:00");
  expect(out).toContain("stage_b.training.daysPerWeek: 5");
  // Data-minimization: identifying PII, internal ids, and bookkeeping never reach
  // the model prompt — at any depth.
  expect(out).not.toContain("Sam");
  expect(out).not.toContain("sam@example.com");
  expect(out).not.toContain("nested@example.com");
  expect(out).not.toContain("555");
  expect(out).not.toContain("tier-uuid-1234");
  expect(out).not.toContain("stage_b_completed_at");
});

test("serializeIntakeForBrief omits empty values and is bounded", () => {
  const out = serializeIntakeForBrief({ goal: "", note: null, tags: [], keep: "yes" });
  expect(out).toBe("keep: yes");

  const huge = serializeIntakeForBrief({ big: "x".repeat(10000) });
  expect(huge.length).toBeLessThanOrEqual(4000);
});
