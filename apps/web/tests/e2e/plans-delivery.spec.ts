import { expect, test } from "@playwright/test";

import { buildGroceryList, categorizeFood, type GroceryFoodMeta } from "@/lib/plans/grocery";
import { fastingState } from "@/lib/plans/fasting";
import { renderPlanPdf } from "@/lib/plans/pdf";

// Phase 4.5 — client delivery coded cores (TDD). Grocery aggregation is the
// §Playwright DoD ("7× aggregation correct"); the fasting counter is a pure
// state machine.

const meta = new Map<string, GroceryFoodMeta>([
  ["chicken", { name: "Chicken breast", allergen_tags: [] }],
  ["rice", { name: "Basmati rice", allergen_tags: [] }],
  ["milk", { name: "Milk", allergen_tags: ["dairy"] }],
  ["spinach", { name: "Spinach", allergen_tags: [] }],
]);

const standardSchedule = Object.fromEntries(Array.from({ length: 7 }, (_, d) => [String(d), "standard"]));

// ── Grocery list ──────────────────────────────────────────────────────────────
test("aggregates a food across all 7 days (7× per-day grams)", () => {
  const groups = buildGroceryList({
    dayTypes: [
      { name: "standard", meals: [{ slot: "lunch", items: [{ food_id: "chicken", grams: 200 }, { food_id: "rice", grams: 150 }] }] },
    ],
    schedule: standardSchedule,
    foodMeta: meta,
  });
  const all = groups.flatMap((g) => g.items);
  const chicken = all.find((i) => i.foodId === "chicken");
  expect(chicken?.grams).toBe(1400); // 200 × 7
  const rice = all.find((i) => i.foodId === "rice");
  expect(rice?.grams).toBe(1050); // 150 × 7
});

test("carb-cycle weeks weight each food by its day-type frequency", () => {
  // high on 3 days, low on 4 days
  const schedule = { "0": "high", "1": "high", "2": "high", "3": "low", "4": "low", "5": "low", "6": "low" };
  const groups = buildGroceryList({
    dayTypes: [
      { name: "high", meals: [{ slot: "l", items: [{ food_id: "rice", grams: 300 }] }] },
      { name: "low", meals: [{ slot: "l", items: [{ food_id: "rice", grams: 100 }] }] },
    ],
    schedule,
    foodMeta: meta,
  });
  const rice = groups.flatMap((g) => g.items).find((i) => i.foodId === "rice");
  expect(rice?.grams).toBe(3 * 300 + 4 * 100); // 1300
});

test("categorizes foods and formats human quantities", () => {
  expect(categorizeFood("Chicken breast", [])).toBe("protein");
  expect(categorizeFood("Milk", ["dairy"])).toBe("dairy");
  expect(categorizeFood("Spinach", [])).toBe("produce");
  expect(categorizeFood("Basmati rice", [])).toBe("grains");

  const groups = buildGroceryList({
    dayTypes: [{ name: "standard", meals: [{ slot: "l", items: [{ food_id: "chicken", grams: 200 }, { food_id: "milk", grams: 250 }] }] }],
    schedule: standardSchedule,
    foodMeta: meta,
  });
  const cats = groups.map((g) => g.category);
  expect(cats).toContain("protein");
  expect(cats).toContain("dairy");
  const chicken = groups.flatMap((g) => g.items).find((i) => i.foodId === "chicken");
  expect(chicken?.display).toBe("1.4 kg"); // 1400 g
});

// ── Fasting counter ───────────────────────────────────────────────────────────
const hm = (h: number, m = 0) => h * 60 + m;

test("inside the eating window → eating, counts down to close", () => {
  const s = fastingState({ start: "12:00", end: "20:00" }, hm(14));
  expect(s.state).toBe("eating");
  expect(s.minutesUntilChange).toBe(hm(6)); // 6h to 20:00
});

test("before the window opens → fasting, counts down to open", () => {
  const s = fastingState({ start: "12:00", end: "20:00" }, hm(9));
  expect(s.state).toBe("fasting");
  expect(s.minutesUntilChange).toBe(hm(3)); // 3h to 12:00
});

test("after the window closes → fasting until tomorrow's open", () => {
  const s = fastingState({ start: "12:00", end: "20:00" }, hm(22));
  expect(s.state).toBe("fasting");
  expect(s.minutesUntilChange).toBe(hm(14)); // 22:00 → 12:00 next day
});

// ── Branded PDF ───────────────────────────────────────────────────────────────
test("renders a valid branded plan PDF with the neutral footer", async () => {
  const buffer = await renderPlanPdf({
    orgName: "Acme Coaching",
    accent: "#0055ff",
    clientName: "you",
    dayTypes: [
      { name: "standard", kcal: 2000, protein_g: 150, meals: [{ slot: "lunch", items: [{ name: "Chicken breast", grams: 200, kcal: 330 }], prepNote: "grill 8 min" }] },
    ],
    grocery: [{ category: "protein", items: [{ foodId: "chicken", name: "Chicken breast", grams: 1400, display: "1.4 kg" }] }],
  });
  expect(buffer.length).toBeGreaterThan(1000);
  expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-"); // a real PDF
});
