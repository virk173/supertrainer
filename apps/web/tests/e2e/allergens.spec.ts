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

test("MF-1: 'Peas / Legumes' pick-list allergen (no food tag) is enforced by name", () => {
  // These seed-style foods carry NO allergen tag — before the fix they slipped
  // straight through for a legume-allergic prospect.
  const legumeFoods = [
    f("Green peas, cooked", []),
    f("Chickpeas (chana), cooked", []),
    f("Pigeon pea (toor dal), cooked", []),
    f("Kidney beans (rajma), cooked", []),
    f("Red lentils (masoor dal), cooked", []),
  ];
  expect(filterSafeFoods(legumeFoods, ["Peas / Legumes"])).toEqual([]);
  // Non-legume foods stay safe for the same client.
  expect(isFoodSafe(f("White rice, cooked", []), ["Peas / Legumes"])).toBe(true);
  expect(isFoodSafe(f("Grilled chicken breast", []), ["Peas / Legumes"])).toBe(true);
  // Free-text singular / specific pulse names also work.
  expect(isFoodSafe(f("Toor dal, cooked", []), ["toor dal"])).toBe(false);
  expect(isFoodSafe(f("Chickpea salad", []), ["chickpeas"])).toBe(false);
});

test("MF-1: 'Mustard' and 'Corn' pick-list allergens are enforced by name", () => {
  expect(isFoodSafe(f("Mustard greens, cooked", []), ["Mustard"])).toBe(false);
  expect(isFoodSafe(f("Sweet corn, boiled", []), ["Corn"])).toBe(false);
  expect(isFoodSafe(f("White rice, cooked", []), ["Corn"])).toBe(true);
});

test("MF-1: name-net tokenizes multi-word entries (whole-label substring no longer required)", () => {
  // Tokenized: "peas" from "Peas / Legumes" matches "green peas".
  expect(isFoodSafe(f("Green peas, cooked", []), ["Peas / Legumes"])).toBe(false);
  // A single-word tag allergen is unaffected by tokenization.
  expect(isFoodSafe(f("Almond flour", ["tree_nut"]), ["tree nuts"])).toBe(false);
  // Tokens under 4 chars don't net unrelated foods.
  expect(isFoodSafe(f("Rice and something", []), ["ab / cd"])).toBe(true);
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
