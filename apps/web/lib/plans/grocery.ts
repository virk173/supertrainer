// Grocery-list generator (Phase 4.5). Pure: aggregates an approved plan's foods
// across a 7-day week (weighting each day type by how often the schedule uses
// it), categorizes them for the aisle, and formats human quantities. All
// arithmetic in code.

export type GroceryCategory = "protein" | "produce" | "dairy" | "grains" | "pantry" | "other";

export interface GroceryFoodMeta {
  name: string;
  allergen_tags: string[];
}

export interface GroceryItem {
  foodId: string;
  name: string;
  grams: number;
  display: string;
}
export interface GroceryGroup {
  category: GroceryCategory;
  items: GroceryItem[];
}

const PROTEIN = /\b(chicken|mutton|goat|beef|lamb|turkey|fish|salmon|tuna|prawn|shrimp|egg|paneer|tofu|tempeh|whey|lentil|dal|chana|bean|rajma)\b/;
const GRAINS = /\b(rice|roti|chapati|bread|oat|poha|quinoa|pasta|noodle|millet|wheat|flour|besan|dosa|idli)\b/;
const PRODUCE = /\b(spinach|broccoli|tomato|onion|potato|carrot|pepper|cucumber|apple|banana|berry|greens|palak|methi|bhindi|okra|cabbage|cauliflower|fruit|veg)\b/;

export function categorizeFood(name: string, allergenTags: string[]): GroceryCategory {
  const n = name.toLowerCase();
  if (allergenTags.includes("dairy") || /\b(milk|yogurt|curd|cheese|ghee|butter)\b/.test(n)) return "dairy";
  if (PROTEIN.test(n)) return "protein";
  if (GRAINS.test(n)) return "grains";
  if (PRODUCE.test(n)) return "produce";
  if (/\b(oil|sugar|salt|spice|masala|sauce|honey|nut|seed|jam)\b/.test(n)) return "pantry";
  return "other";
}

function displayQty(grams: number): string {
  if (grams >= 1000) {
    const kg = grams / 1000;
    return `${Number.isInteger(kg) ? kg : kg.toFixed(1)} kg`;
  }
  return `${grams} g`;
}

const CATEGORY_ORDER: GroceryCategory[] = ["protein", "produce", "dairy", "grains", "pantry", "other"];

export interface GroceryPlanInput {
  dayTypes: { name: string; meals: { slot: string; items: { food_id: string; grams: number }[] }[] }[];
  /** weekday (0-6) → day-type name. */
  schedule: Record<string, string>;
  foodMeta: Map<string, GroceryFoodMeta>;
}

export function buildGroceryList(input: GroceryPlanInput): GroceryGroup[] {
  const byName = new Map(input.dayTypes.map((d) => [d.name, d]));
  // How many of the 7 days use each day type.
  const counts = new Map<string, number>();
  for (let d = 0; d < 7; d++) {
    const name = input.schedule[String(d)] ?? input.dayTypes[0]?.name;
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  // If the schedule was empty, fall back to the first day type every day.
  if (counts.size === 0 && input.dayTypes[0]) counts.set(input.dayTypes[0].name, 7);

  const grams = new Map<string, number>();
  for (const [dayType, count] of counts) {
    const dt = byName.get(dayType);
    if (!dt) continue;
    for (const meal of dt.meals) {
      for (const it of meal.items) {
        grams.set(it.food_id, (grams.get(it.food_id) ?? 0) + it.grams * count);
      }
    }
  }

  const groups = new Map<GroceryCategory, GroceryItem[]>();
  for (const [foodId, total] of grams) {
    const m = input.foodMeta.get(foodId);
    const name = m?.name ?? foodId;
    const category = categorizeFood(name, m?.allergen_tags ?? []);
    const item: GroceryItem = { foodId, name, grams: total, display: displayQty(total) };
    (groups.get(category) ?? groups.set(category, []).get(category)!).push(item);
  }

  return CATEGORY_ORDER.filter((c) => groups.has(c)).map((category) => ({
    category,
    items: (groups.get(category) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
  }));
}
