import { z } from "zod";

import { zodOutput } from "./zodOutput";

// Stage B conversational interview agent (Phase 2.5, ORIGINAL-SPEC §10).
// Asks ONE question per message in the trainer's voice, parses free-text answers
// into typed fields, and confirms what it understood. The model NEVER decides
// when a section is done — code checks the merged answers against the section
// schema (isSectionComplete). That keeps "did we actually capture what P3 needs"
// a deterministic question.

export const INTERVIEW_SECTIONS = [
  "logistics",
  "goals",
  "nutrition",
  "training",
  "lifestyle",
  "health",
] as const;
export type InterviewSection = (typeof INTERVIEW_SECTIONS)[number];

// Pacing: sections are spread across days 1–3 so onboarding feels like a
// conversation, not a form dump.
export const SECTION_DAY: Record<InterviewSection, 1 | 2 | 3> = {
  logistics: 1,
  goals: 1,
  nutrition: 2,
  training: 2,
  lifestyle: 3,
  health: 3,
};

// Required fields per section. The must-captures Phase 3 depends on are required
// here (timezone, preferred language, weigh-in days, meals/day, meal times);
// everything else is colour the coach can use but the ledger doesn't need.
export const SECTION_SCHEMAS = {
  logistics: z.object({
    timezone: z.string().min(1).describe('IANA timezone, e.g. "Asia/Kolkata".'),
    preferredLanguage: z.string().min(1).describe('e.g. "English", "Hinglish".'),
    weighInDays: z
      .array(z.string())
      .min(1)
      .describe('Weekday names; offer Mon/Wed/Sat as the default.'),
  }),
  goals: z.object({
    primaryGoal: z.string().min(1),
    motivation: z.string().optional(),
    targetTimeline: z.string().optional(),
  }),
  nutrition: z.object({
    mealsPerDay: z.number().int().min(1).max(10),
    mealTimes: z
      .array(z.string())
      .min(1)
      .describe('Usual clock times, e.g. ["08:00","13:30","20:00"].'),
    dietaryPattern: z.string().optional(),
    cooksAtHome: z.boolean().optional(),
  }),
  training: z.object({
    daysPerWeek: z.number().int().min(0).max(7),
    equipmentAccess: z.string().min(1),
    experience: z.string().optional(),
  }),
  lifestyle: z.object({
    sleepHours: z.number().min(0).max(24),
    workPattern: z.string().min(1).describe("Desk job, shift work, on-feet, etc."),
    stressLevel: z.string().optional(),
  }),
  health: z.object({
    // Explicit "nothing to report" is the completion signal — an empty object
    // must never read as "asked and answered".
    nothingToReport: z.boolean(),
  }),
} as const;

export type SectionAnswers = Record<string, unknown>;

// What the model may return for a turn: what it understood (all fields optional —
// it only fills what it actually learned) plus its next message.
function turnSchema(section: InterviewSection) {
  return z.object({
    reply: z
      .string()
      .min(1)
      .max(600)
      .describe("The coach's next message. Exactly ONE question."),
    parsed: SECTION_SCHEMAS[section].partial(),
  });
}

export interface InterviewTurnInput {
  section: InterviewSection;
  /** Serialized confirmed trainer style (voice) — "" if not ingested yet. */
  styleText: string;
  /** Recent turns, oldest first. */
  history: { sender: "assistant" | "client"; body: string }[];
  /** Everything captured for this section so far. */
  answersSoFar: SectionAnswers;
  /** The client's newest message ("" when opening a section). */
  clientMessage: string;
  clientName?: string;
}

export interface InterviewTurnOutput {
  reply: string;
  parsed: SectionAnswers;
}

const SECTION_BRIEF: Record<InterviewSection, string> = {
  logistics: "their timezone, the language they'd like to be coached in, and which days they'll weigh in (offer Mon/Wed/Sat as an easy default)",
  goals: "what they actually want out of this, why it matters to them now, and any timeline",
  nutrition: "how many meals they usually eat, the times they usually eat them, and how they eat/cook",
  training: "how many days a week they can train and what equipment or gym they have access to",
  lifestyle: "how they sleep, and what their work/day pattern looks like (desk job, shifts, on their feet)",
  health: "whether there's anything health-wise their coach should know before programming — conditions, medications, injuries. If they say there's nothing, set nothingToReport true",
};

const SYSTEM = `You are conducting a friendly onboarding conversation on behalf of a personal trainer, speaking AS that trainer in their voice.

Hard rules:
- Ask exactly ONE question per message. Never stack two questions.
- Sound like a person texting, not a form. Short. Warm. No bullet lists.
- When the client tells you something, briefly reflect it back so they know you got it ("Got it — 3 rotis is your usual lunch base?"), then ask the next thing.
- Put into "parsed" ONLY what the client actually told you. Never invent or assume a value. Leave a field out if you don't genuinely know it.
- Follow up adaptively on what they say (if they mention shift work, ask about their schedule pattern).
- Never give medical advice. Never diagnose.
- Do not tell them the interview is complete — that's decided elsewhere.`;

export async function interviewTurn(
  input: InterviewTurnInput,
): Promise<InterviewTurnOutput> {
  const { section, styleText, history, answersSoFar, clientMessage, clientName } = input;

  const transcript = history
    .map((m) => `${m.sender === "assistant" ? "Coach" : "Client"}: ${m.body}`)
    .join("\n");

  const prompt = `The coach's voice (mirror this):
${styleText || "(no style profile yet — warm, encouraging, plain-spoken, lightly informal)"}

Client: ${clientName ?? "the client"}
Current topic: ${section} — you're trying to learn ${SECTION_BRIEF[section]}.

Already captured for this topic (do NOT ask again):
${JSON.stringify(answersSoFar)}

Conversation so far:
${transcript || "(this is your opening message for this topic)"}

${clientMessage ? `The client just said:\n"""${clientMessage}"""` : "Open this topic with one friendly question."}

Reply with your next single message, and put anything you just learned into "parsed".`;

  const result = await zodOutput(turnSchema(section), {
    task: "draft",
    system: SYSTEM,
    cacheSystem: true,
    prompt,
    maxTokens: 800,
  });

  // Drop undefined/empty values so a partial answer never overwrites a captured
  // one with nothing.
  const parsed: SectionAnswers = {};
  for (const [k, v] of Object.entries(result.parsed as SectionAnswers)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    parsed[k] = v;
  }

  return { reply: result.reply, parsed };
}

// Code — not the model — decides completion: the merged answers must satisfy the
// section's required fields.
export function isSectionComplete(
  section: InterviewSection,
  answers: SectionAnswers,
): boolean {
  return SECTION_SCHEMAS[section].safeParse(answers).success;
}

// The next section the client is allowed to reach, honouring day-based pacing.
// Returns null when everything available for `dayNumber` is already done.
export function nextSection(
  answersBySection: Record<string, SectionAnswers>,
  dayNumber: number,
): InterviewSection | null {
  for (const section of INTERVIEW_SECTIONS) {
    if (SECTION_DAY[section] > dayNumber) continue;
    if (!isSectionComplete(section, answersBySection[section] ?? {})) return section;
  }
  return null;
}

// True once every section has what it needs — the trigger for intake assembly.
export function isInterviewComplete(
  answersBySection: Record<string, SectionAnswers>,
): boolean {
  return INTERVIEW_SECTIONS.every((s) =>
    isSectionComplete(s, answersBySection[s] ?? {}),
  );
}
