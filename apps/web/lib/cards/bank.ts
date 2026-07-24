// Phase 6.5 — the check-in card bank (versioned templates). Static + code-owned:
// the picker chooses from these by data gap, they render inline in the thread, and
// tap-answers write to check_in_responses. `custom` is the trainer-authored seam
// (question + answer type) — authoring UI is P7.

export type CardKind =
  | "sleep"
  | "stress"
  | "soreness"
  | "energy"
  | "motivation"
  | "weekend_plan"
  | "travel"
  | "questionnaire"
  | "custom";

export type AnswerType = "scale" | "choice";

export interface CardTemplate {
  id: string;
  version: number;
  kind: CardKind;
  question: string;
  answerType: AnswerType;
  /** For a 1–5 scale, the low/high labels; for a choice, the options. */
  options?: string[];
}

export const CARD_BANK: CardTemplate[] = [
  { id: "sleep-1", version: 1, kind: "sleep", question: "How did you sleep last night?", answerType: "scale", options: ["Awful", "Great"] },
  { id: "stress-1", version: 1, kind: "stress", question: "How's your stress today?", answerType: "scale", options: ["Calm", "Maxed out"] },
  { id: "soreness-1", version: 1, kind: "soreness", question: "How sore are you feeling today?", answerType: "scale", options: ["Fresh", "Very sore"] },
  { id: "energy-1", version: 1, kind: "energy", question: "What's your energy like today?", answerType: "scale", options: ["Drained", "Buzzing"] },
  { id: "motivation-1", version: 1, kind: "motivation", question: "How motivated are you feeling right now?", answerType: "scale", options: ["Low", "Fired up"] },
  {
    id: "weekend-1",
    version: 1,
    kind: "weekend_plan",
    question: "Anything this weekend that might affect training or food?",
    answerType: "choice",
    options: ["All good", "Eating out", "Travelling", "Event / party"],
  },
  {
    id: "travel-1",
    version: 1,
    kind: "travel",
    question: "Travelling this week? Let's adapt the plan.",
    answerType: "choice",
    options: ["Not travelling", "Hotel gym", "No gym", "Limited food"],
  },
  { id: "questionnaire-1", version: 1, kind: "questionnaire", question: "Quick check-in: how's the plan feeling overall?", answerType: "scale", options: ["Struggling", "Loving it"] },
];

export function cardByKind(kind: CardKind): CardTemplate | undefined {
  return CARD_BANK.find((c) => c.kind === kind);
}

export function cardById(id: string): CardTemplate | undefined {
  return CARD_BANK.find((c) => c.id === id);
}
