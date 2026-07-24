// Phase 6.5 — the client weekly recap (coded assembly, pure). Score/streak/
// highlights are computed from the ledger (passed in); a voice wrap only phrases
// the optional insight line. Shame-free by construction, mirroring the P3.5 copy.

export interface WeeklyRecapInput {
  score: number;
  band: string;
  streak: number;
  mealsLogged: number;
  weighIns: number;
  nextDayType: string | null;
}

export interface WeeklyRecap {
  headline: string;
  score: number;
  streak: number;
  lines: string[];
  nextPreview: string;
}

function headlineFor(band: string, streak: number): string {
  if (band === "locked_in") return streak > 0 ? `Locked in — ${streak}-day streak!` : "Locked in this week!";
  if (band === "building") return "Building momentum this week";
  return "Fresh start — let's build this week";
}

export function buildWeeklyRecap(input: WeeklyRecapInput): WeeklyRecap {
  const lines: string[] = [];
  lines.push(`Adherence: ${input.score}/100`);
  if (input.streak > 0) lines.push(`Streak: ${input.streak} day${input.streak === 1 ? "" : "s"}`);
  lines.push(`You logged ${input.mealsLogged} meal${input.mealsLogged === 1 ? "" : "s"} and ${input.weighIns} weigh-in${input.weighIns === 1 ? "" : "s"}.`);

  const nextPreview = input.nextDayType
    ? `Next up: a ${input.nextDayType} day to kick off the week.`
    : "Next up: a fresh week — same steady habits.";

  return {
    headline: headlineFor(input.band, input.streak),
    score: input.score,
    streak: input.streak,
    lines,
    nextPreview,
  };
}
