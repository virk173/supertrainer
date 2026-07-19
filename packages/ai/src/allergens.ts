// Deterministic allergen taxonomy + food filter (Phase 2.2). This is the safety
// core of the teaser preview: the candidate food pool is filtered HERE, in code,
// BEFORE anything reaches the model — the model can only ever pick from foods
// that already passed this filter. No allergen food may appear in a preview
// (ORIGINAL-SPEC §10, hard rule). The filter is intentionally fail-closed:
// ambiguity always errs toward EXCLUDING a food, never including it.

// Canonical allergen tags. Every seeded food carries the subset of these its
// ingredients imply (foods.allergen_tags); the taxonomy maps a user's free-text
// allergies onto the same vocabulary so the two can be compared.
export type AllergenTag =
  | "peanut"
  | "tree_nut"
  | "dairy"
  | "egg"
  | "soy"
  | "gluten"
  | "fish"
  | "shellfish"
  | "sesame"
  | "coconut";

export const ALLERGEN_TAGS: readonly AllergenTag[] = [
  "peanut",
  "tree_nut",
  "dairy",
  "egg",
  "soy",
  "gluten",
  "fish",
  "shellfish",
  "sesame",
  "coconut",
];

interface AllergenGroup {
  tag: AllergenTag;
  label: string;
  // Normalized fragments that, appearing anywhere in a user's allergy text,
  // imply this allergen. Substring match — deliberately broad. Cross-matches
  // (e.g. "coconut" contains "nut" → also flags tree_nut) only ever OVER-exclude,
  // which is the safe direction.
  synonyms: string[];
}

const TAXONOMY: AllergenGroup[] = [
  {
    tag: "peanut",
    label: "Peanuts",
    synonyms: ["peanut", "groundnut", "moongphali", "mungfali", "mungphali"],
  },
  {
    tag: "tree_nut",
    label: "Tree nuts",
    synonyms: [
      "tree nut",
      "treenut",
      "nut", // broad on purpose; over-excludes coconut/peanut foods (safe)
      "almond",
      "badam",
      "cashew",
      "kaju",
      "walnut",
      "akhrot",
      "pistachio",
      "pista",
      "hazelnut",
      "pecan",
      "macadamia",
      "brazil nut",
      "pine nut",
    ],
  },
  {
    tag: "dairy",
    label: "Dairy",
    synonyms: [
      "dairy",
      "milk",
      "lactose",
      "whey",
      "casein",
      "ghee",
      "paneer",
      "butter",
      "cheese",
      "yogurt",
      "yoghurt",
      "curd",
      "dahi",
      "cream",
      "buttermilk",
      "khoya",
      "mawa",
    ],
  },
  {
    tag: "egg",
    label: "Eggs",
    synonyms: ["egg", "anda", "albumen", "mayonnaise", "mayo"],
  },
  {
    tag: "soy",
    label: "Soy",
    synonyms: ["soy", "soya", "soybean", "tofu", "edamame", "tempeh"],
  },
  {
    tag: "gluten",
    label: "Gluten / Wheat",
    synonyms: [
      "gluten",
      "wheat",
      "atta",
      "maida",
      "suji",
      "semolina",
      "rava",
      "barley",
      "rye",
      "seitan",
      "chapati",
      "chapathi",
    ],
  },
  {
    tag: "fish",
    label: "Fish",
    synonyms: [
      "fish",
      "salmon",
      "tuna",
      "cod",
      "mackerel",
      "sardine",
      "machli",
      "rohu",
      "tilapia",
      "anchovy",
    ],
  },
  {
    tag: "shellfish",
    label: "Shellfish",
    synonyms: [
      "shellfish",
      "shrimp",
      "prawn",
      "jhinga",
      "crab",
      "lobster",
      "crayfish",
      "mussel",
      "oyster",
      "squid",
    ],
  },
  {
    tag: "sesame",
    label: "Sesame",
    synonyms: ["sesame", "til", "tahini", "gingelly"],
  },
  {
    tag: "coconut",
    label: "Coconut",
    synonyms: ["coconut", "nariyal", "copra"],
  },
];

// A food shape this module can filter (foods rows and preview candidates match).
export interface FoodLike {
  name_normalized: string;
  allergen_tags: string[];
}

// Canonical tags implied by a person's free-text allergies. Substring match,
// so "almond flour" → tree_nut, "ghee"/"whey" → dairy, "tree nuts" → tree_nut.
export function excludedAllergenTags(userAllergens: string[]): Set<AllergenTag> {
  const tags = new Set<AllergenTag>();
  for (const raw of userAllergens) {
    const s = raw.toLowerCase().trim();
    if (!s) continue;
    for (const group of TAXONOMY) {
      if (group.synonyms.some((syn) => s.includes(syn))) tags.add(group.tag);
    }
  }
  return tags;
}

// Free-text safety net: allergy terms (≥4 chars) matched as substrings of a
// food's normalized name, catching allergens the taxonomy doesn't map. 4-char
// floor avoids netting unrelated foods on tiny tokens (e.g. "egg" in "eggplant"
// — eggs are already covered by the tag path). Over-matching here is safe.
function nameNetTerms(userAllergens: string[]): string[] {
  return userAllergens
    .map((a) => a.toLowerCase().trim())
    .filter((a) => a.length >= 4);
}

// True when a food is safe for someone with these allergies. Excludes on either
// a tag match or a name-net hit — fail-closed.
export function isFoodSafe(food: FoodLike, userAllergens: string[]): boolean {
  if (userAllergens.length === 0) return true;
  const excluded = excludedAllergenTags(userAllergens);
  if (food.allergen_tags.some((t) => excluded.has(t as AllergenTag))) return false;

  const name = food.name_normalized.toLowerCase();
  if (nameNetTerms(userAllergens).some((term) => name.includes(term))) return false;

  return true;
}

// The candidate pool the preview model is allowed to see. Everything downstream
// draws only from this, and the result is re-checked against it (belt and
// suspenders) in the generation lib.
export function filterSafeFoods<T extends FoodLike>(
  foods: T[],
  userAllergens: string[],
): T[] {
  return foods.filter((food) => isFoodSafe(food, userAllergens));
}

// Human-readable labels for the taxonomy (used by the property test + any UI).
export function allergenLabels(): { tag: AllergenTag; label: string }[] {
  return TAXONOMY.map((g) => ({ tag: g.tag, label: g.label }));
}
