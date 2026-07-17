// Dietary-preference filter for the preview candidate pool (Phase 2.2). Runs in
// code alongside the allergen filter so the model only ever sees foods that fit
// the client's stated preference (veg / non_veg / vegan). Non-veg detection is a
// name heuristic over the seed; the seed carries no meat flag yet (P3.1 can add
// a structured dietary tag). Errs toward EXCLUDING on ambiguity for veg/vegan.

export type DietPreference = "veg" | "non_veg" | "vegan";

// Word-ish patterns for animal foods. `\b<term>` matches the term as a word
// start so plurals work ("prawns") without "egg" catching "eggplant".
const NON_VEG_PATTERNS: RegExp[] = [
  /\bchicken/,
  /\bmutton/,
  /\bgoat/,
  /\bbeef/,
  /\blamb/,
  /\bturkey/,
  /\bfish/,
  /\bsalmon/,
  /\btuna/,
  /\bcod\b/,
  /\brohu/,
  /\btilapia/,
  /\bprawn/,
  /\bshrimp/,
  /\bcrab/,
  /\blobster/,
  /\bmeat/,
  /\begg\b/, // "egg", "egg white", "duck egg" — not "eggplant"
  /\bduck/,
];

function isAnimalFood(nameNormalized: string): boolean {
  return NON_VEG_PATTERNS.some((re) => re.test(nameNormalized));
}

export interface DietFilterable {
  name_normalized: string;
  allergen_tags: string[];
}

// Honey is not vegan and carries no allergen tag, so name-match it for vegans.
const NON_VEGAN_NAME = /\bhoney\b/;

export function fitsDiet(food: DietFilterable, pref: DietPreference): boolean {
  if (pref === "non_veg") return true;
  if (isAnimalFood(food.name_normalized)) return false;
  if (pref === "vegan") {
    if (food.allergen_tags.includes("dairy")) return false;
    if (NON_VEGAN_NAME.test(food.name_normalized)) return false;
  }
  return true;
}

export function filterByDiet<T extends DietFilterable>(
  foods: T[],
  pref: DietPreference,
): T[] {
  return foods.filter((f) => fitsDiet(f, pref));
}
