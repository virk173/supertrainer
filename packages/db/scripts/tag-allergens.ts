// Phase 3.1 — seed/import-time allergen tagging.
//
// Thin wrapper over the shared runtime derivation (../src/allergens.ts) that
// adds the seed-specific concern: UNION a food's hand-declared tags with the
// name/ingredient-derived ones and validate the declared vocabulary. Single
// source of truth for the keyword map lives in src/allergens.ts so the seed
// generator and createOrgCustomFood can't drift.

import {
  type AllergenTag,
  deriveAllergenTags,
  isAllergenTag,
} from "../src/allergens.ts";

// Final tag set for a food: declared ∪ derived, de-duped and sorted (stable
// output keeps the generated migration diff-clean).
export function tagFood(
  declared: string[] | undefined,
  name: string,
  ingredientsHint?: string,
): AllergenTag[] {
  const set = new Set<AllergenTag>();
  for (const t of declared ?? []) {
    if (isAllergenTag(t)) set.add(t);
    else throw new Error(`Unknown declared allergen tag "${t}" on food "${name}"`);
  }
  for (const t of deriveAllergenTags(`${name} ${ingredientsHint ?? ""}`)) set.add(t);
  return [...set].sort();
}

export { deriveAllergenTags };
