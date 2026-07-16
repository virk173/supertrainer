import { zodOutput } from "../zodOutput";
import {
  DietProfileSchema,
  TrainingProfileSchema,
  VoiceProfileSchema,
  type DietProfile,
  type StyleDomain,
  type TrainingProfile,
  type VoiceProfile,
} from "./schemas";

// Style-learning extraction agents (Phase 1.3, master plan §4.2). Each reads
// the concatenated text of a trainer's uploaded materials and returns a
// Zod-validated candidate profile the trainer then confirms. All route through
// modelRouter task 'ingest' (Opus tier) with the domain instructions cached.

// Shared discipline for every extractor: report only what the materials show.
const GROUNDING = `You are analyzing a personal trainer's OWN past coaching materials to learn how THEY work, so an assistant can later draft in their exact style.

Rules:
- Extract ONLY what the materials actually show. Do not invent, average toward a generic coach, or fill gaps with best practices.
- When a field isn't evidenced, use the schema's "unknown"/"none" value or an empty array — never guess.
- Prefer the trainer's own wording. Normalize enums/nouns as the field descriptions instruct.
- These are examples of their real work; capture the recurring patterns, not one-off exceptions.`;

const DIET_SYSTEM = `${GROUNDING}

Domain: DIET. Capture how this trainer structures nutrition — meal cadence, carb timing, portioning, protocols (intermittent fasting, carb cycling, etc.), cuisine lean, the staple foods they rotate, loved/banned foods, and supplement placement. Respect cuisine specifics (e.g. Indian home cooking: rotis, dal, paneer, rice) exactly as written.`;

const TRAINING_SYSTEM = `${GROUNDING}

Domain: TRAINING. Capture how this trainer programs lifting — weekly frequency, split archetype, the exercises they reach for (most frequent first), how they drive progression (load vs volume vs rotation), their set/rep habits, and warmup approach.`;

const VOICE_SYSTEM = `${GROUNDING}

Domain: VOICE. Capture how this trainer TALKS to clients — tone, their actual greetings and sign-offs (verbatim), emoji usage, language or blend (e.g. Hinglish), typical message length, and a bank of signature phrases they reuse word-for-word. Pull real phrases from the text; do not paraphrase.`;

export async function dietStyleExtractor(text: string): Promise<DietProfile> {
  return zodOutput(DietProfileSchema, {
    task: "ingest",
    system: DIET_SYSTEM,
    cacheSystem: true,
    prompt: `Extract the diet style profile from these materials:\n\n${text}`,
  });
}

export async function trainingStyleExtractor(
  text: string,
): Promise<TrainingProfile> {
  return zodOutput(TrainingProfileSchema, {
    task: "ingest",
    system: TRAINING_SYSTEM,
    cacheSystem: true,
    prompt: `Extract the training style profile from these materials:\n\n${text}`,
  });
}

export async function voiceStyleExtractor(
  text: string,
): Promise<VoiceProfile> {
  return zodOutput(VoiceProfileSchema, {
    task: "ingest",
    system: VOICE_SYSTEM,
    cacheSystem: true,
    prompt: `Extract the voice style profile from these materials:\n\n${text}`,
  });
}

// Dispatch by domain — used by the ingestion pipeline and the eval harness.
export function extractStyleProfile(
  domain: StyleDomain,
  text: string,
): Promise<DietProfile | TrainingProfile | VoiceProfile> {
  switch (domain) {
    case "diet":
      return dietStyleExtractor(text);
    case "training":
      return trainingStyleExtractor(text);
    case "voice":
      return voiceStyleExtractor(text);
  }
}
