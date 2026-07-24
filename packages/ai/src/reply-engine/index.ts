import { z } from "zod";

import { zodOutput } from "../zodOutput";

// Phase 6.4 — the reply engine. Two agents, both injectable so CI drives the
// surrounding control flow with deterministic fakes:
//   * wrapNumbers  — the AUTONOMOUS lane: Haiku phrases code-computed facts into
//     a friendly line. The numbers are passed in verbatim; the model NEVER
//     produces or changes a number.
//   * draftReply   — the DRAFT lane: Sonnet drafts a reply in the coach's voice
//     for the trainer to approve/edit. Plan-impact answers are grounded in the
//     coded client_context numbers.

// ── autonomous number-wrapping (Haiku) ───────────────────────────────────────
const WrapSchema = z.object({ reply: z.string().min(1).max(500) });

export interface WrapNumbersInput {
  fact: string; // the code-computed fact, e.g. "remaining today: kcal 800, protein 60g…"
  question: string;
  styleText?: string;
}
export type NumberWrapper = (input: WrapNumbersInput) => Promise<string>;

const WRAP_SYSTEM = `You are a friendly assistant for a personal-training client. Turn the FACT into ONE short, warm reply (1–2 sentences) to the client's question.

HARD RULE: use every number in the FACT EXACTLY as given. Never change, round, add, or compute a number. If the FACT has no number, don't invent one.`;

export async function wrapNumbers(input: WrapNumbersInput): Promise<string> {
  const system = input.styleText
    ? `${WRAP_SYSTEM}\n\nMatch this coach's tone:\n${input.styleText}`
    : WRAP_SYSTEM;
  const out = await zodOutput(WrapSchema, {
    task: "parse", // Haiku
    system,
    cacheSystem: true,
    prompt: `Client asked: "${input.question}"\nFACT (use the numbers verbatim): ${input.fact}`,
    maxTokens: 200,
  });
  return out.reply;
}

// ── drafted reply (Sonnet, trainer voice) ────────────────────────────────────
const DraftSchema = z.object({ draft: z.string().min(1).max(1500) });

export interface DraftReplyInput {
  contextText: string; // serialized client_context (coded numbers included)
  triggeringMessage: string;
  styleText: string;
  category: "conversational" | "plan_impact";
  exemplars?: string[]; // top-k similar past replies (P4.3 embeddings; may be empty)
}
export type ReplyDrafter = (input: DraftReplyInput) => Promise<string>;

const DRAFT_SYSTEM = `You draft a reply that a personal trainer will review before it's sent to their client. Write in the COACH's voice — warm, specific, and concise. Output ONLY the reply text (no preamble, no sign-off unless the coach's style uses one).

If the question depends on the client's numbers, use the ones in <client_context> EXACTLY — never invent or compute a number.`;

export async function draftReply(input: DraftReplyInput): Promise<string> {
  const exemplarBlock =
    input.exemplars && input.exemplars.length
      ? `\n\nPast replies in this coach's voice (for tone, not content):\n${input.exemplars.map((e) => `- ${e}`).join("\n")}`
      : "";
  const out = await zodOutput(DraftSchema, {
    task: "draft", // Sonnet
    system: `${DRAFT_SYSTEM}\n\nCOACH VOICE:\n${input.styleText}${exemplarBlock}`,
    cacheSystem: true,
    prompt: `${input.contextText}\n\nThe client just messaged: "${input.triggeringMessage}"\nDraft the coach's reply${input.category === "plan_impact" ? ", grounding any numbers in the context above" : ""}.`,
    maxTokens: 400,
  });
  return out.draft;
}
