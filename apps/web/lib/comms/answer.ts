import { wrapNumbers, type NumberWrapper } from "@supertrainer/ai";

import type { ClientContext } from "@/lib/comms/context";
import type { Macros } from "@/lib/comms/numbers";

// Phase 6.4 — the autonomous lane (routine_autonomous only). The FACT is computed
// in code from the assembled context; a Haiku wrap phrases it. Two safety nets
// keep the LLM out of the numbers (CLAUDE.md rule 4): the fact is code-derived,
// and the wrapped copy is re-validated — if it introduces any number the fact
// didn't contain, we fall back to the plain coded fact (validate-after, like
// allergens). So a hallucinated macro can never reach a client.

export type AutonomousKind = "macros" | "next_session" | "eating_window";

export interface AutonomousFact {
  kind: AutonomousKind;
  fact: string;
}

function macroLine(m: Macros): string {
  return `kcal ${m.kcal}, protein ${m.protein}g, carbs ${m.carbs}g, fat ${m.fat}g`;
}

// Match the routine question to a code-computed fact. Returns null when nothing
// matches (→ the caller drafts instead of guessing).
export function computeAutonomousAnswer(ctx: ClientContext, text: string): AutonomousFact | null {
  const t = text.toLowerCase();
  if (
    ctx.remaining &&
    /\b(macro|macros|carb|carbs|protein|calorie|calories|kcal|left|remaining|how much)\b/.test(t)
  ) {
    return { kind: "macros", fact: `remaining today: ${macroLine(ctx.remaining)}` };
  }
  if (/\b(next session|next workout|training day)\b/.test(t) || /when.*(train|workout|session|gym)/.test(t)) {
    if (ctx.todaySession) return { kind: "next_session", fact: `today is your ${ctx.todaySession.label} session` };
    if (ctx.nextSessionLabel) return { kind: "next_session", fact: `your next session is ${ctx.nextSessionLabel}` };
  }
  if (ctx.fastWindow && (/\b(fast|fasting|eating window)\b/.test(t) || /when.*eat/.test(t))) {
    return { kind: "eating_window", fact: `your eating window is ${ctx.fastWindow.start}–${ctx.fastWindow.end}` };
  }
  return null;
}

function numbersIn(s: string): string[] {
  return s.match(/\d+/g) ?? [];
}

// Every number in the reply must appear in the code-computed fact.
export function replyNumbersAreGrounded(fact: string, reply: string): boolean {
  const allowed = new Set(numbersIn(fact));
  return numbersIn(reply).every((n) => allowed.has(n));
}

export async function autonomousReply(
  ctx: ClientContext,
  text: string,
  deps: { wrap?: NumberWrapper; styleText?: string } = {},
): Promise<{ fact: AutonomousFact; reply: string } | null> {
  const fact = computeAutonomousAnswer(ctx, text);
  if (!fact) return null;

  const wrap = deps.wrap ?? wrapNumbers;
  let reply: string;
  try {
    reply = await wrap({ fact: fact.fact, question: text, styleText: deps.styleText });
    // Validate-after: the model may only rephrase, never introduce a number.
    if (!replyNumbersAreGrounded(fact.fact, reply)) reply = fact.fact;
  } catch {
    // Model down (no key, outage) → the plain coded fact. Correct numbers, plainer
    // copy — the client still gets an accurate answer.
    reply = fact.fact;
  }
  return { fact, reply };
}
