import { expect, test } from "@playwright/test";

import { humanizeField, styleCoverage } from "../../lib/style/coverage";

// PO-2 — pure style-coverage math (node-level, no browser, no AI).

test("a richly-extracted profile scores strong", () => {
  const cov = styleCoverage({
    mealsPerDay: 4,
    mealStructure: "3 meals + 1 snack",
    carbTiming: "post_workout",
    portionStyle: "hand_portions",
    protocols: ["intermittent_fasting"],
    cuisineBias: ["indian"],
    foodRotationPool: ["rice", "chicken", "paneer"],
    lovedFoods: ["dal"],
    bannedFoods: ["soda"],
    supplementPlacement: ["whey post-workout"],
  });
  expect(cov.band).toBe("strong");
  expect(cov.score).toBe(1);
  expect(cov.weak).toEqual([]);
});

test("unknown / empty fields drag the score down and surface as weak spots", () => {
  const cov = styleCoverage({
    daysPerWeek: 4, // filled
    splitArchetypes: ["upper/lower"], // filled
    exercisePool: [], // empty → weak
    progressionStyle: "unknown", // unknown → weak
    volumeRepHabits: "3-4 sets of 8-12", // filled
    warmupPatterns: "unknown", // unknown → weak
  });
  expect(cov.filled).toBe(3);
  expect(cov.total).toBe(6);
  expect(cov.score).toBe(0.5);
  expect(cov.band).toBe("developing");
  expect(cov.weak).toEqual(["Exercise pool", "Progression style", "Warmup patterns"]);
});

test("a definite 'none' counts as a real answer, a lone 'unknown' array does not", () => {
  expect(styleCoverage({ protocols: ["none"] }).filled).toBe(1); // decided
  expect(styleCoverage({ carbTiming: "none" }).filled).toBe(1); // decided
  expect(styleCoverage({ toneMarkers: ["unknown"] }).filled).toBe(0); // not extracted
  expect(styleCoverage({ greeting: "" }).filled).toBe(0);
});

test("mostly-empty profile is thin", () => {
  const cov = styleCoverage({
    toneMarkers: [], // empty
    greeting: "unknown", // unknown
    signoff: "unknown", // unknown
    emojiRate: "none", // concrete
    languageMix: "english", // concrete
    avgMessageLength: "medium", // concrete
    phraseBank: [], // empty
  });
  // 3 of 7 filled (emojiRate/languageMix/avgMessageLength concrete; the rest
  // unknown/empty) → 0.43, below the developing bar.
  expect(cov.filled).toBe(3);
  expect(cov.band).toBe("thin");
  expect(styleCoverage({ a: "unknown", b: [], c: "" }).band).toBe("thin");
});

test("humanizeField makes readable labels", () => {
  expect(humanizeField("warmupPatterns")).toBe("Warmup patterns");
  expect(humanizeField("food_rotation_pool")).toBe("Food rotation pool");
});
