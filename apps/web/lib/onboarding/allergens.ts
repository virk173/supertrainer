// Common allergens offered in the Stage A typeahead (Phase 2.1). This is the
// UX pick-list; the deterministic food-exclusion taxonomy that guarantees no
// allergen food reaches a preview is built separately in P2.2
// (packages/ai/allergens.ts). Trainers' clients may also add free-text entries
// the pick-list doesn't cover — both are stored verbatim in leads.allergens.
export const COMMON_ALLERGENS = [
  "Peanuts",
  "Tree nuts",
  "Almonds",
  "Cashews",
  "Walnuts",
  "Milk / Dairy",
  "Lactose",
  "Whey",
  "Eggs",
  "Soy",
  "Wheat",
  "Gluten",
  "Fish",
  "Shellfish",
  "Crustaceans (prawn, crab)",
  "Sesame",
  "Mustard",
  "Peas / Legumes",
  "Corn",
  "Coconut",
  "Sulphites",
] as const;

// A free-text allergen the pick-list doesn't cover. Trimmed, capped, and
// deduped (case-insensitively) against the current selection by the caller.
export function normalizeAllergen(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, 60);
}
