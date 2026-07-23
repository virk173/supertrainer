// Weekly adherence score (Phase 3.5). A weighted roll-up of per-day component
// satisfaction. Deliberately averages over the week so a single missed log can
// never cliff the score (the client sees this number — ORIGINAL-SPEC §5).

export const SCORE_WEIGHTS = {
  meals: 0.4,
  weighIn: 0.15,
  training: 0.3,
  checkin: 0.15,
} as const;

// Per-day satisfaction per component in [0,1], or null when the component wasn't
// expected that day (a rest day expects no training; a non-weigh-in day expects
// no weigh-in). Nulls are excluded so they neither help nor hurt the score.
export interface DayScore {
  meals: number | null;
  weighIn: number | null;
  training: number | null;
  checkin: number | null;
}

type Component = keyof typeof SCORE_WEIGHTS;
const COMPONENTS: Component[] = ["meals", "weighIn", "training", "checkin"];

// 0-100. Each component is averaged over the days it applied, weighted, and
// normalized by the weights that actually applied. A week with no expectations
// scores 100 (nothing was missed).
export function weeklyAdherenceScore(days: DayScore[]): number {
  let weighted = 0;
  let appliedWeight = 0;
  for (const c of COMPONENTS) {
    const vals = days.map((d) => d[c]).filter((v): v is number => v !== null);
    if (vals.length === 0) continue;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    weighted += SCORE_WEIGHTS[c] * avg;
    appliedWeight += SCORE_WEIGHTS[c];
  }
  if (appliedWeight === 0) return 100;
  return Math.round((weighted / appliedWeight) * 100);
}

export type ScoreBand = "reset" | "building" | "locked_in";

// Supportive framing bands — never shame language (ORIGINAL-SPEC §5). Copy bank
// reviewed for tone: a low score is a fresh start, not a failure.
export function scoreBand(score: number): { band: ScoreBand; label: string; message: string } {
  if (score < 50) {
    return {
      band: "reset",
      label: "Let's reset",
      message: "A fresh start begins with one log. Your coach is right here with you.",
    };
  }
  if (score <= 75) {
    return {
      band: "building",
      label: "Building momentum",
      message: "You're stacking good days — keep the streak rolling.",
    };
  }
  return {
    band: "locked_in",
    label: "Locked in",
    message: "Consistent and dialed in. This is exactly what steady progress looks like.",
  };
}
