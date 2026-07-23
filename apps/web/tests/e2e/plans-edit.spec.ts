import { expect, test } from "@playwright/test";

import type { DayTypeTarget } from "@supertrainer/nutrition-engine";

import { applyPlanEdit, PlanEditError, type PlanContent } from "@/lib/plans/edit";
import { plansActivePayload } from "@/lib/plans/activate";
import { distillEditPatterns, type DraftEditRow } from "@/lib/plans/distill";

// Phase 4.3 — coded review logic (TDD). Pure edit transforms with capture, the
// plans_active mapping, and the edit-pattern distillation.

const content = (): PlanContent => ({
  versions: [
    {
      label: "A",
      dayTypes: [
        {
          name: "standard",
          meals: [
            { slot: "breakfast", items: [{ food_id: "oats", grams: 80 }, { food_id: "milk", grams: 200 }] },
            { slot: "lunch", items: [{ food_id: "chicken", grams: 200 }] },
          ],
        },
      ],
    },
    { label: "B", dayTypes: [{ name: "standard", meals: [{ slot: "breakfast", items: [{ food_id: "eggs", grams: 100 }] }] }] },
  ],
});

// ── applyPlanEdit ─────────────────────────────────────────────────────────────
test("resize updates grams and captures before/after", () => {
  const { content: next, capture } = applyPlanEdit(content(), {
    kind: "resize", versionLabel: "A", dayType: "standard", slot: "breakfast", foodId: "oats", grams: 120,
  });
  expect(next.versions[0].dayTypes[0].meals[0].items[0].grams).toBe(120);
  expect(capture.edit_kind).toBe("resize");
  expect(capture.path).toBe("versions.0.dayTypes.0.meals.0.items.0");
  expect((capture.before as { grams: number }).grams).toBe(80);
  expect((capture.after as { grams: number }).grams).toBe(120);
});

test("swap changes the food id and captures the pair", () => {
  const { content: next, capture } = applyPlanEdit(content(), {
    kind: "swap", versionLabel: "A", dayType: "standard", slot: "breakfast", foodId: "oats", toFoodId: "poha", grams: 90,
  });
  const items = next.versions[0].dayTypes[0].meals[0].items;
  expect(items[0].food_id).toBe("poha");
  expect(items[0].grams).toBe(90);
  expect((capture.before as { food_id: string }).food_id).toBe("oats");
  expect((capture.after as { food_id: string }).food_id).toBe("poha");
});

test("add appends an item; remove deletes it", () => {
  const added = applyPlanEdit(content(), { kind: "add", versionLabel: "A", dayType: "standard", slot: "lunch", foodId: "rice", grams: 150 });
  expect(added.content.versions[0].dayTypes[0].meals[1].items).toHaveLength(2);
  expect(added.capture.edit_kind).toBe("add");

  const removed = applyPlanEdit(content(), { kind: "remove", versionLabel: "A", dayType: "standard", slot: "breakfast", foodId: "milk" });
  const ids = removed.content.versions[0].dayTypes[0].meals[0].items.map((i) => i.food_id);
  expect(ids).toEqual(["oats"]);
  expect(removed.capture.edit_kind).toBe("remove");
});

test("edits never mutate the input content in place", () => {
  const original = content();
  applyPlanEdit(original, { kind: "resize", versionLabel: "A", dayType: "standard", slot: "breakfast", foodId: "oats", grams: 500 });
  expect(original.versions[0].dayTypes[0].meals[0].items[0].grams).toBe(80);
});

test("editing a missing target throws a PlanEditError", () => {
  expect(() =>
    applyPlanEdit(content(), { kind: "resize", versionLabel: "Z", dayType: "standard", slot: "breakfast", foodId: "oats", grams: 100 }),
  ).toThrow(PlanEditError);
});

// ── plansActivePayload ────────────────────────────────────────────────────────
test("plans_active payload — targets keyed by day type, standard schedule, slots", () => {
  const dayTypes: DayTypeTarget[] = [{ name: "standard", kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 60 }];
  const p = plansActivePayload(dayTypes, content().versions[0], null, "2026-07-23");
  expect(p.targets.standard.kcal).toBe(2000);
  expect(p.meal_slots).toEqual(["breakfast", "lunch"]);
  expect(Object.keys(p.schedule)).toHaveLength(7);
  expect(new Set(Object.values(p.schedule))).toEqual(new Set(["standard"]));
  expect(p.effective_from).toBe("2026-07-23");
});

test("plans_active payload — carb cycle spreads day types across the week", () => {
  const dayTypes: DayTypeTarget[] = [
    { name: "high", kcal: 2600, protein_g: 150, carbs_g: 300, fat_g: 60 },
    { name: "low", kcal: 1800, protein_g: 150, carbs_g: 120, fat_g: 60 },
  ];
  const p = plansActivePayload(dayTypes, content().versions[0], null, "2026-07-23");
  const used = new Set(Object.values(p.schedule));
  expect(used).toEqual(new Set(["high", "low"]));
});

// ── distillEditPatterns ───────────────────────────────────────────────────────
test("distill surfaces a recurring swap above the threshold", () => {
  const edits: DraftEditRow[] = [
    ...Array.from({ length: 3 }, () => ({ edit_kind: "swap", before: { food_id: "oats" }, after: { food_id: "poha" } })),
    { edit_kind: "swap", before: { food_id: "rice" }, after: { food_id: "quinoa" } }, // once, below threshold
    { edit_kind: "resize", before: { food_id: "oats", grams: 80 }, after: { food_id: "oats", grams: 120 } },
  ];
  const patterns = distillEditPatterns(edits);
  expect(patterns).toHaveLength(1);
  expect(patterns[0]).toMatchObject({ kind: "swap", from: "oats", to: "poha", count: 3 });
  expect(patterns[0].exemplar).toContain("oats");
  expect(patterns[0].exemplar).toContain("poha");
});
