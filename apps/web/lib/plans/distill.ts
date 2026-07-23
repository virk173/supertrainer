// Edit-pattern distillation (Phase 4.3, the learning loop -- MASTER-PLAN 4.2).
// Pure aggregation over captured draft_edits: recurring food swaps and removals
// become style-exemplar proposals (e.g. "swaps oats for poha"). The nightly job
// runs this, writes proposals to style_exemplars, and embeds them (behind a
// no-op-safe seam). Pure so the aggregation is unit-tested without DB or a model.

export interface DraftEditRow {
  edit_kind: string;
  before: unknown;
  after: unknown;
}

export interface EditPattern {
  kind: "swap" | "remove";
  from?: string;
  to?: string;
  count: number;
  exemplar: string; // the natural-language line embedded into style_exemplars
}

const foodId = (v: unknown): string | undefined => {
  if (v && typeof v === "object" && "food_id" in v) return String((v as { food_id: unknown }).food_id);
  return undefined;
};

// A delimiter that cannot appear inside a UUID food_id, so swap keys never
// collide and split cleanly.
const SEP = "|";

// Recurring patterns at or above `minCount` (default 3 -- three of the same swap
// is a habit, not noise).
export function distillEditPatterns(edits: DraftEditRow[], minCount = 3): EditPattern[] {
  const swaps = new Map<string, number>();
  const removes = new Map<string, number>();

  for (const e of edits) {
    if (e.edit_kind === "swap") {
      const from = foodId(e.before);
      const to = foodId(e.after);
      if (from && to && from !== to) {
        const key = from + SEP + to;
        swaps.set(key, (swaps.get(key) ?? 0) + 1);
      }
    } else if (e.edit_kind === "remove") {
      const from = foodId(e.before);
      if (from) removes.set(from, (removes.get(from) ?? 0) + 1);
    }
  }

  const patterns: EditPattern[] = [];
  for (const [key, count] of swaps) {
    if (count < minCount) continue;
    const [from, to] = key.split(SEP);
    patterns.push({ kind: "swap", from, to, count, exemplar: "Frequently swaps " + from + " for " + to + "." });
  }
  for (const [from, count] of removes) {
    if (count < minCount) continue;
    patterns.push({ kind: "remove", from, count, exemplar: "Frequently removes " + from + "." });
  }
  // Most-frequent first (deterministic tiebreak by exemplar text).
  return patterns.sort((a, b) => b.count - a.count || a.exemplar.localeCompare(b.exemplar));
}
