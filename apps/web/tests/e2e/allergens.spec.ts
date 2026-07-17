import { expect, test } from "@playwright/test";

import {
  filterSafeFoods,
  isFoodSafe,
  excludedAllergenTags,
  allergenLabels,
  type FoodLike,
} from "../../../../packages/ai/src/allergens";
import { serviceClient } from "./helpers";

// Deterministic coverage of the safety core (no browser, no AI). The preview's
// allergen guarantee rests entirely on filterSafeFoods — if a food survives it,
// the model can pick it, so this is where "no allergen food in any preview" is
// proven.

const f = (name: string, tags: string[]): FoodLike => ({
  name_normalized: name.toLowerCase(),
  allergen_tags: tags,
});

test("tricky cases: tree-nut/dairy/whey map correctly", () => {
  // "tree nuts" must exclude almond flour (tagged tree_nut).
  expect(filterSafeFoods([f("Almond flour", ["tree_nut"])], ["tree nuts"])).toEqual([]);
  // ghee and whey are dairy.
  expect(filterSafeFoods([f("Ghee", ["dairy"]), f("Whey protein isolate", ["dairy"])], ["dairy"])).toEqual([]);
  // "milk" implies dairy → ghee excluded.
  expect(filterSafeFoods([f("Ghee", ["dairy"])], ["milk"])).toEqual([]);
  // "whey" alone implies dairy.
  expect(filterSafeFoods([f("Whey protein isolate", ["dairy"])], ["whey"])).toEqual([]);
  // A peanut allergy must NOT strip a plainly safe food.
  expect(filterSafeFoods([f("White rice, cooked", [])], ["peanuts"])).toHaveLength(1);
});

test("free-text net catches an allergen the taxonomy doesn't map", () => {
  // "mango" isn't a canonical tag; the name-net (≥4 chars) still excludes it.
  expect(isFoodSafe(f("Mango", []), ["mango"])).toBe(false);
  // Unrelated food stays safe.
  expect(isFoodSafe(f("Banana", []), ["mango"])).toBe(true);
});

test("empty allergies keep everything", () => {
  const foods = [f("Peanuts", ["peanut"]), f("Milk, whole", ["dairy"])];
  expect(filterSafeFoods(foods, [])).toHaveLength(2);
});

// PROPERTY TEST (DoD): for every allergen in the taxonomy, no food carrying that
// allergen's tag may survive the filter — run across the real seeded foods DB.
test("property: no allergen-tagged food survives its own allergen, across the whole seed", async () => {
  const service = serviceClient();
  const { data: foods } = await service
    .from("foods")
    .select("name_normalized, allergen_tags")
    .is("org_id", null);

  expect(foods && foods.length).toBeGreaterThan(100);
  const pool = foods as FoodLike[];

  for (const { tag, label } of allergenLabels()) {
    const safe = filterSafeFoods(pool, [label]);
    const excluded = excludedAllergenTags([label]);
    const leaked = safe.filter((food) =>
      food.allergen_tags.some((t) => excluded.has(t as never)),
    );
    expect(
      leaked,
      `allergen "${label}" (${tag}) leaked ${leaked.length} food(s) into the safe pool`,
    ).toEqual([]);
  }
});
