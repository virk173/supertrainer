// Deterministic field-accuracy scorer for the style-ingestion eval. Each field
// is scored 0..1 by a type-appropriate comparator; a fixture's score is the
// mean across its expected fields. No model calls here — pure comparison.

type FieldType = "num" | "enum" | "contains" | "text" | "array";

// One entry per expected field (names are unique across the three domains).
const FIELD_TYPES: Record<string, FieldType> = {
  // diet
  mealsPerDay: "num",
  mealStructure: "text",
  carbTiming: "enum",
  portionStyle: "enum",
  protocols: "array",
  cuisineBias: "array",
  foodRotationPool: "array",
  lovedFoods: "array",
  bannedFoods: "array",
  supplementPlacement: "array",
  // training
  daysPerWeek: "num",
  splitArchetypes: "array",
  exercisePool: "array",
  progressionStyle: "enum",
  volumeRepHabits: "text",
  warmupPatterns: "text",
  // voice
  toneMarkers: "array",
  greeting: "text",
  signoff: "text",
  emojiRate: "enum",
  languageMix: "contains",
  avgMessageLength: "enum",
  phraseBank: "array",
};

const STOPWORDS = new Set([
  "a", "an", "the", "of", "with", "and", "then", "on", "in", "to", "per",
  "day", "days", "is", "are", "for", "at", "by",
]);

function norm(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(v: unknown): string[] {
  return norm(v).split(" ").filter((w) => w && !STOPWORDS.has(w));
}

function asArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => norm(x)).filter(Boolean) : [];
}

// expected item is a key substring; matched if it and some actual item overlap.
function arrayRecall(expected: unknown, actual: unknown): number {
  const exp = asArray(expected);
  if (exp.length === 0) return 1;
  const act = asArray(actual);
  const matched = exp.filter((e) =>
    act.some((a) => a.includes(e) || e.includes(a)),
  ).length;
  return matched / exp.length;
}

function textOverlap(expected: unknown, actual: unknown): number {
  const exp = new Set(words(expected));
  if (exp.size === 0) return 1;
  const act = new Set(words(actual));
  let hit = 0;
  for (const w of exp) if (act.has(w)) hit++;
  return hit / exp.size;
}

function scoreField(type: FieldType, expected: unknown, actual: unknown): number {
  switch (type) {
    case "num":
      return Number(actual) === Number(expected) ? 1 : 0;
    case "enum":
      return norm(actual) === norm(expected) ? 1 : 0;
    case "contains":
      return norm(actual).includes(norm(expected)) ? 1 : 0;
    case "text":
      return textOverlap(expected, actual);
    case "array":
      return arrayRecall(expected, actual);
  }
}

export interface FieldScore {
  field: string;
  score: number;
}

export interface FixtureScore {
  overall: number;
  fields: FieldScore[];
}

export function scoreFixture(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
): FixtureScore {
  const fields: FieldScore[] = Object.keys(expected).map((field) => {
    const type = FIELD_TYPES[field] ?? "text";
    return { field, score: scoreField(type, expected[field], actual?.[field]) };
  });
  const overall =
    fields.reduce((sum, f) => sum + f.score, 0) / (fields.length || 1);
  return { overall, fields };
}
