// Phase 3.1 — food-side allergen derivation (runtime-safe, zero deps).
//
// packages/ai/allergens.ts maps a USER's allergy text -> tags (and filters the
// preview pool). This is the complementary direction used when INGESTING foods:
// map a food's name + ingredient text -> the tags it CONTAINS. Two callers share
// it: the seed/import generator (build-time bulk tagging) and createOrgCustomFood
// (a fail-closed safety net over a trainer's hand-entered recipe).
//
// Fail-closed (ORIGINAL-SPEC §10): a keyword hit ADDS a tag; a matched allergen
// is never silently dropped. Over-tagging only over-excludes a food from an
// allergic client's options (safe); under-tagging could let it through (unsafe).

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

// Substring keywords that imply a food CONTAINS the allergen, matched against
// the lowercased "name + ingredient hint". Kept free of the two known traps:
// bare "nut" (would tag every coconut) and "roti" (jowar/bajra/makki rotis are
// gluten-free) — plus matching is word-boundary anchored (below) so "til" no
// longer fires inside "lentil" nor "egg" inside "eggplant".
const CONTAINS: Record<AllergenTag, string[]> = {
  peanut: ["peanut", "groundnut", "moongphali", "mungfali", "mungphali"],
  tree_nut: [
    "cashew", "kaju", "almond", "badam", "walnut", "akhrot", "pistachio", "pista",
    "hazelnut", "pecan", "macadamia", "brazil nut", "pine nut", "tree nut",
  ],
  dairy: [
    "milk", "dairy", "paneer", "cheese", "butter", "ghee", "cream", "malai",
    "curd", "dahi", "yogurt", "yoghurt", "khoya", "mawa", "whey", "casein",
    "buttermilk", "lassi", "kheer", "rabri", "rabdi",
  ],
  egg: ["egg", "anda", "albumen", "omelette", "omelet", "mayonnaise", "mayo"],
  soy: ["soy", "soya", "tofu", "edamame", "tempeh"],
  gluten: [
    "wheat", "atta", "maida", "suji", "semolina", "rava", "barley", "rye",
    "seitan", "naan", "paratha", "puri", "bhatura", "samosa", "kachori",
    "thepla", "missi", "bread", "pasta", "vermicelli", "sevai",
  ],
  fish: [
    "fish", "salmon", "tuna", "cod", "mackerel", "sardine", "machli", "rohu",
    "tilapia", "anchovy", "pomfret", "surmai",
  ],
  shellfish: [
    "shellfish", "shrimp", "prawn", "jhinga", "crab", "lobster", "crayfish",
    "mussel", "oyster", "squid",
  ],
  sesame: ["sesame", "til", "tahini", "gingelly"],
  coconut: ["coconut", "nariyal", "copra"],
};

export const ALL_ALLERGEN_TAGS = Object.keys(CONTAINS) as AllergenTag[];

export function isAllergenTag(t: string): t is AllergenTag {
  return (ALL_ALLERGEN_TAGS as string[]).includes(t);
}

// Whole-word match with optional simple plural (s/es). Word boundaries stop the
// substring mis-fires; plurals/multi-word keywords ("peanuts", "tree nut") still
// match. Compounds a boundary would miss (e.g. "buttermilk" via "milk") are
// listed as their own keywords.
function keywordMatches(hay: string, kw: string): boolean {
  const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${esc}(s|es)?\\b`).test(hay);
}

// Tags implied by free text (a food name and/or ingredient hint).
export function deriveAllergenTags(text: string): AllergenTag[] {
  const hay = text.toLowerCase();
  const found: AllergenTag[] = [];
  for (const tag of ALL_ALLERGEN_TAGS) {
    if (CONTAINS[tag].some((kw) => keywordMatches(hay, kw))) found.push(tag);
  }
  return found;
}
