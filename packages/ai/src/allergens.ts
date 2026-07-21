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

// Pick-list / free-text allergens with NO seeded food tag — notably
// "Peas / Legumes", plus "Mustard" and "Corn". Their multi-word labels never
// appear verbatim in food names, so the raw-label name-net cannot catch them
// (this was the MF-1 hole: legume-allergic prospects saw pea/dal/chickpea foods).
// Here we match KNOWN food-name fragments instead: `triggers` select the group
// from the user's allergy text; `nameSynonyms` mark a food unsafe when they
// appear in its normalized name. Fail-closed: broad matches only OVER-exclude,
// which is the safe direction.
interface NameOnlyAllergen {
  label: string;
  triggers: string[];
  nameSynonyms: string[];
}

const NAME_ONLY_ALLERGENS: NameOnlyAllergen[] = [
  {
    label: "Peas / Legumes",
    // "peas" (not bare "pea") so a peanut allergy doesn't needlessly trigger this.
    triggers: [
      "peas", "legume", "pulse", "lentil", "dal", "daal", "chana",
      "chickpea", "rajma", "moong", "mung", "masoor", "urad", "toor",
      "arhar", "cowpea", "lobia", "gram",
    ],
    nameSynonyms: [
      "pea", "chickpea", "chana", "dal", "daal", "lentil", "rajma",
      "moong", "mung", "masoor", "urad", "toor", "arhar", "cowpea",
      "lobia", "gram", "pulse", "legume", "bean",
    ],
  },
  { label: "Mustard", triggers: ["mustard", "sarson"], nameSynonyms: ["mustard", "sarson"] },
  { label: "Corn", triggers: ["corn", "maize", "makka", "makki", "bhutta"], nameSynonyms: ["corn", "maize", "makka", "makki", "bhutta"] },
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

// Free-text safety net: TOKENS (≥4 chars) of the user's allergy entries matched
// as substrings of a food's normalized name, catching allergens the taxonomy
// doesn't map. Tokenizing on non-alphanumerics is what makes multi-word labels
// like "Peas / Legumes" or "Milk / Dairy" work — the raw whole-label substring
// never appears in a food name. The 4-char floor avoids netting unrelated foods
// on tiny tokens (e.g. "egg" in "eggplant" — eggs are covered by the tag path).
// Over-matching here is safe (fail-closed).
function nameNetTerms(userAllergens: string[]): string[] {
  const terms = new Set<string>();
  for (const entry of userAllergens) {
    for (const token of entry.toLowerCase().split(/[^a-z0-9]+/)) {
      if (token.length >= 4) terms.add(token);
    }
  }
  return [...terms];
}

// True when a food is safe for someone with these allergies. Excludes on a tag
// match, a name-only-allergen food-name hit, or a free-text name-net hit — all
// fail-closed.
export function isFoodSafe(food: FoodLike, userAllergens: string[]): boolean {
  if (userAllergens.length === 0) return true;
  const excluded = excludedAllergenTags(userAllergens);
  if (food.allergen_tags.some((t) => excluded.has(t as AllergenTag))) return false;

  const name = food.name_normalized.toLowerCase();

  // Name-only allergens (pick-list/free-text items with no seeded food tag):
  // if the user's text selects the group, exclude foods whose name carries any
  // of its known fragments.
  const normText = userAllergens.map((a) => a.toLowerCase().trim()).filter(Boolean);
  for (const grp of NAME_ONLY_ALLERGENS) {
    const selected = normText.some((s) => grp.triggers.some((t) => s.includes(t)));
    if (selected && grp.nameSynonyms.some((n) => name.includes(n))) return false;
  }

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
