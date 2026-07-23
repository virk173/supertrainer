// Exercise selection agent (Phase 5.2) — fills each skeleton day from the
// INJURY-SAFE exercise pool ONLY, choosing exercise_id + sets/reps/RIR per the
// trainer's habits (the model never invents an exercise or computes volume —
// CLAUDE.md rule 4). On a validation failure the orchestrator re-invokes with the
// exact gaps in `feedback`.

import { zodOutput } from "../zodOutput";
import { SplitDraftSchema, type SplitDraft, type SplitSelectionInput } from "./schemas";

const RULES = `You fill training-day skeletons for a personal trainer's split by choosing exercises and set/rep schemes.

Hard rules:
- SELECT ONLY exercises from the provided pool, referenced by their exact exercise_id. NEVER invent an exercise_id or use one not in the pool.
- You choose exercise_id + sets + a rep range (text) + RIR ONLY. Do not compute or output any volume totals — weekly volume is checked in code.
- Hit each day's per-muscle set targets as closely as possible using exercises whose muscles match (they are checked in code against the trainer's volume landmarks and push/pull balance).
- Prefer compound movements first each day, then accessories; match the trainer's set/rep/RIR habits from the style profile.
- Exercises flagged "CAUTION" are allowed for this injured client but should be used sparingly and only when nothing safer fits — prefer non-caution options.
- Give each exercise one short coaching cue, and each day a brief warmup block.`;

export async function exerciseSelectionAgent(input: SplitSelectionInput): Promise<SplitDraft> {
  const poolLines = input.candidates
    .map((c) => {
      const flag = c.caution ? " | CAUTION" : "";
      return `${c.id} | ${c.name} | patterns: ${c.movement_patterns.join(",")} | primary: ${c.primary_muscles.join(",")} | equip: ${c.equipment.join(",")}${flag}`;
    })
    .join("\n");
  const skeletonLines = input.skeleton.days
    .map(
      (d) =>
        `${d.label} (${d.focus}): ${d.muscleTargets.map((t) => `${t.muscle} ${t.sets}sets`).join(", ")}`,
    )
    .join("\n");

  const prompt = [
    `Split archetype: ${input.skeleton.archetype}`,
    `Day skeletons (per-muscle per-day set targets):\n${skeletonLines}`,
    `Exercise pool — choose ONLY from these (exercise_id | name | patterns | primary muscles | equipment):\n${poolLines}`,
    input.feedback
      ? `Your previous attempt FAILED code validation. Fix exactly these and resubmit every day:\n${input.feedback}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const out = await zodOutput(SplitDraftSchema, {
    task: "plan",
    system: RULES,
    cacheSystem: true,
    prompt,
    maxTokens: 8000,
  });
  return out;
}
