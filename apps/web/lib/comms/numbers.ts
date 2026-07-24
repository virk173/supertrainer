// Phase 6.4 — the coded-numbers core (pure). Every macro a client sees in an
// autonomous answer or a plan-impact draft is computed HERE, from their plan
// target and their logged intake — the LLM only ever phrases these numbers, it
// never produces them (CLAUDE.md rule 4). Kept tiny and pure so it can be
// exhaustively fixtured; a bug here misinforms a real person's eating.

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export function remainingMacros(target: Macros, logged: Macros): Macros {
  const rem = (t: number, l: number) => Math.max(0, Math.round(t) - Math.round(l));
  return {
    kcal: rem(target.kcal, logged.kcal),
    protein: rem(target.protein, logged.protein),
    carbs: rem(target.carbs, logged.carbs),
    fat: rem(target.fat, logged.fat),
  };
}

// Sum a set of logged meal totals into one Macros (protein/carbs/fat/kcal only).
export function sumLogged(
  totals: Array<{ kcal?: number; protein?: number; carbs?: number; fat?: number }>,
): Macros {
  const acc: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const t of totals) {
    acc.kcal += t.kcal ?? 0;
    acc.protein += t.protein ?? 0;
    acc.carbs += t.carbs ?? 0;
    acc.fat += t.fat ?? 0;
  }
  return {
    kcal: Math.round(acc.kcal),
    protein: Math.round(acc.protein),
    carbs: Math.round(acc.carbs),
    fat: Math.round(acc.fat),
  };
}
