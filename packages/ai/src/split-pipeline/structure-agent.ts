// Split structure agent (Phase 5.2) — designs the split SKELETON (archetype, day
// labels, per-day muscle set targets) in the trainer's own programming style.
// The trainer's training style profile is the DOMINANT instruction and is
// prompt-cached; availability/experience/goal live in the prompt. No exercises
// or rep schemes here — that's the selection agent + coded volume math.

import { serializeStyleProfile } from "../style/serialize";
import { zodOutput } from "../zodOutput";
import { SplitSkeletonSchema, type SplitSkeleton, type SplitStructureInput } from "./schemas";

const RULES = `You design the SKELETON of a training split for a personal trainer: the split archetype, the distinct training-day labels, and per-day per-muscle set targets.

Hard rules:
- The trainer's split archetypes and programming habits in the style profile above are the DOMINANT instruction — mirror how they split the week (e.g. push/pull/legs, upper/lower, full body).
- Emit one entry per DISTINCT training-day label (e.g. PPL = 3 entries even if trained 6 days — the schedule repeats them, computed in code).
- Choose an archetype that fits the client's available days: fewer days favor full-body/upper-lower, more days allow PPL or body-part splits.
- Give each day balanced per-muscle set targets using normalized muscle names (chest, lats, upper_back, shoulders, biceps, triceps, quads, hamstrings, glutes, calves, abs, traps, forearms). Keep weekly push and pull volume roughly balanced.
- You do NOT pick exercises, reps, or RIR here — only the structure and per-muscle set targets.`;

export async function splitStructureAgent(input: SplitStructureInput): Promise<SplitSkeleton> {
  const styleBlock = input.styleProfile
    ? serializeStyleProfile("training", input.styleProfile as unknown as Record<string, unknown>)
    : '<style_profile domain="training">(none on file — use a sensible default archetype)</style_profile>';
  const system = `${styleBlock}\n\n${RULES}`;

  const prompt = [
    `Training days per week: ${input.availability.daysPerWeek}`,
    `Experience: ${input.experience}`,
    input.goal ? `Goal: ${input.goal}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const out = await zodOutput(SplitSkeletonSchema, {
    task: "plan",
    system,
    cacheSystem: true,
    prompt,
    maxTokens: 2500,
  });
  return out;
}
