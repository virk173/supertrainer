import { keywordHealthFlags } from "./health";

// Phase 6.3 — the deterministic escalation floor (Gate 1). Reuses the P2.5 health
// keyword gate (condition/medication/pregnancy/injury/eating_disorder) and adds
// the broader escalation signals: acute pain/symptoms, emotional distress,
// self-harm, and program-change requests — multilingual, incl. Hinglish. Pure and
// synchronous: this is the floor that fires with or without an API key, and a
// classifier can only ever ADD to it, never clear it (fail-closed).

export type EscalationCategory =
  | "medical" // condition / medication / pregnancy disclosures (from the health gate)
  | "injury" // injury or an acute physical symptom (pain, dizziness, chest, numbness…)
  | "eating_disorder"
  | "distress" // emotional distress (non-self-harm)
  | "self_harm" // self-harm / suicidal signals → surfaces a crisis-resources card
  | "plan_change"; // a request to change the STRUCTURE of the program → the trainer decides

// Curated to catch real disclosures while avoiding the broadest gym slang — no
// bare "kill" / "dead" / "dying" / "sick", so "this workout is killing me" and
// "my legs are dead" do NOT trip the floor. Over-matching a genuine symptom is
// fine (false positives are acceptable); missing one is not.
const KEYWORDS: Record<"injury" | "distress" | "self_harm" | "plan_change", string[]> = {
  injury: [
    "pain", "painful", "hurt", "hurts", "hurting", "dizzy", "dizziness",
    "lightheaded", "light headed", "faint", "fainted", "chest pain",
    "cant breathe", "can t breathe", "short of breath", "numb", "numbness",
    "tingling", "swollen", "swelling", "pulled a muscle", "pulled my",
    "pinched nerve", "gave out", "buckled", "popped", "cramping badly",
    // Hinglish
    "dard", "chot", "chakkar", "sujan", "moch",
  ],
  distress: [
    "depressed", "depression", "panic attack", "panic attacks",
    "anxiety attack", "cant cope", "can t cope", "breaking down",
    "hopeless", "burnt out", "burned out",
  ],
  self_harm: [
    "harm myself", "self harm", "self harming", "kill myself", "end my life",
    "end it all", "dont want to live", "don t want to live", "want to die",
    "suicidal", "suicide", "no reason to live", "better off dead",
    "point in anything", // "don't see the point in anything anymore"
  ],
  plan_change: [
    "switch me", "switch my", "change my plan", "change my program",
    "change my routine", "change my split", "change the plan", "redo my plan",
    "different plan", "different split", "different program", "different routine",
    "new plan", "fewer days", "more days a week", "days a week instead",
  ],
};

function normalize(text: string): string {
  // Match health.ts: normalize separators so hyphenated/slashed/apostrophized
  // spellings match the space-separated keywords ("self-harm" → "self harm").
  return (text || "").toLowerCase().replace(/[-_/']+/g, " ").replace(/\s+/g, " ");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface EscalationKeywordResult {
  categories: EscalationCategory[];
  matched: string[];
  selfHarm: boolean;
}

// The deterministic escalation floor. Unions the health gate's categories (mapped
// to escalation categories) with the broader escalation groups above.
export function keywordEscalation(text: string): EscalationKeywordResult {
  const s = normalize(text);
  const categories = new Set<EscalationCategory>();
  const matched: string[] = [];

  // Health gate → escalation categories.
  const health = keywordHealthFlags(text);
  for (const c of health.categories) {
    if (c === "condition" || c === "medication" || c === "pregnancy") categories.add("medical");
    else if (c === "injury") categories.add("injury");
    else if (c === "eating_disorder") categories.add("eating_disorder");
  }
  matched.push(...health.matched);

  // Broader escalation groups.
  for (const cat of ["injury", "distress", "self_harm", "plan_change"] as const) {
    for (const kw of KEYWORDS[cat]) {
      if (new RegExp(`\\b${escapeRegex(kw)}\\b`).test(s)) {
        categories.add(cat);
        matched.push(kw);
      }
    }
  }

  return { categories: [...categories], matched, selfHarm: categories.has("self_harm") };
}
