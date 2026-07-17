import { z } from "zod";

import { zodOutput } from "./zodOutput";

// Health-flag escalation gate v1 (Phase 2.5; P6 hardens it). HARD RULE: any
// mention of a medical condition, medication, pregnancy/nursing, injury, or
// eating-disorder signal must pause the interview and route to the trainer —
// the AI never coaches around a health disclosure.
//
// FAIL-CLOSED by construction:
//   * the deterministic keyword pass alone can flag — a classifier that says
//     "no" can never clear a keyword hit;
//   * a classifier error/outage degrades to the keyword result, never to
//     "unflagged";
//   * the classifier is told to flag when unsure.
// The cost of a false positive is a trainer glancing at a note. The cost of a
// false negative is coaching someone through a medical problem.

export type HealthFlagCategory =
  | "condition"
  | "medication"
  | "pregnancy"
  | "injury"
  | "eating_disorder";

export const HEALTH_FLAG_CATEGORIES: readonly HealthFlagCategory[] = [
  "condition",
  "medication",
  "pregnancy",
  "injury",
  "eating_disorder",
];

// Word-boundary matched, so "pill" doesn't fire on "pillow" and "heart" doesn't
// fire on "hearty".
const KEYWORDS: Record<HealthFlagCategory, string[]> = {
  condition: [
    "diabetes", "diabetic", "hypertension", "blood pressure", "thyroid",
    "hypothyroid", "pcos", "pcod", "asthma", "cardiac", "heart condition",
    "heart problem", "cholesterol", "epilepsy", "seizure", "arthritis",
    "cancer", "kidney", "liver", "ibs", "crohn", "colitis", "celiac",
    "anemia", "anaemia", "sleep apnea", "apnea", "fatty liver", "gout",
    "migraine", "ulcer", "hernia", "vertigo",
  ],
  medication: [
    "medication", "medications", "medicine", "meds", "insulin", "metformin",
    "statin", "statins", "antidepressant", "antidepressants", "ssri",
    "steroid", "steroids", "prescription", "prescribed", "dosage",
    "beta blocker", "blood thinner", "thyroxine", "inhaler",
  ],
  pregnancy: [
    "pregnant", "pregnancy", "nursing", "breastfeeding", "breast feeding",
    "postpartum", "trimester", "expecting a baby", "ivf",
  ],
  injury: [
    "injury", "injured", "surgery", "operated", "fracture", "fractured",
    "torn", "tear", "herniated", "slipped disc", "sciatica", "tendonitis",
    "tendinitis", "physio", "physiotherapy", "physical therapy", "rehab",
    "sprain", "sprained", "dislocated", "acl", "meniscus", "rotator cuff",
    "frozen shoulder", "chronic pain",
  ],
  eating_disorder: [
    "anorexia", "anorexic", "bulimia", "bulimic", "binge", "bingeing",
    "binging", "purge", "purging", "eating disorder", "starve myself",
    "starving myself", "laxative", "laxatives", "orthorexia",
    "body dysmorphia", "self harm",
  ],
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface HealthFlagResult {
  flagged: boolean;
  categories: HealthFlagCategory[];
  /** The literal phrases that tripped the deterministic pass. */
  matched: string[];
  source: "keyword" | "classifier" | "both" | "none";
}

// Deterministic pass. Pure and synchronous — this is the floor that always runs,
// with or without an API key.
export function keywordHealthFlags(text: string): {
  categories: HealthFlagCategory[];
  matched: string[];
} {
  const s = (text || "").toLowerCase();
  const categories: HealthFlagCategory[] = [];
  const matched: string[] = [];
  for (const category of HEALTH_FLAG_CATEGORIES) {
    for (const kw of KEYWORDS[category]) {
      if (new RegExp(`\\b${escapeRegex(kw)}\\b`).test(s)) {
        if (!categories.includes(category)) categories.push(category);
        matched.push(kw);
      }
    }
  }
  return { categories, matched };
}

const ClassificationSchema = z.object({
  flagged: z.boolean(),
  categories: z.array(z.enum(HEALTH_FLAG_CATEGORIES as [HealthFlagCategory, ...HealthFlagCategory[]])).default([]),
  reason: z.string().max(200).default(""),
});

const CLASSIFIER_SYSTEM = `You screen messages from personal-training clients for anything that needs a human coach's attention rather than an AI's.

Flag the message if it mentions or implies ANY of:
- condition: a medical condition or diagnosis (current or past)
- medication: any medicine, supplement prescribed by a doctor, or dosage
- pregnancy: pregnancy, trying to conceive, nursing, or postpartum
- injury: an injury, surgery, chronic pain, or rehab
- eating_disorder: disordered-eating signals (restriction, bingeing, purging, laxatives, body dysmorphia, self-harm)

Rules:
- If you are unsure, FLAG IT. A false alarm is harmless; a miss is not.
- Flag even when it is mentioned casually or in passing.
- Do NOT flag ordinary soreness, tiredness, or normal training fatigue.
- Do NOT flag someone simply stating a fitness goal.`;

// Nuance pass — catches phrasing the keyword list misses ("my sugar levels are
// off", "the doctor told me to avoid squats"). Never used to CLEAR a keyword hit.
async function classifyHealth(text: string) {
  return zodOutput(ClassificationSchema, {
    task: "classify",
    system: CLASSIFIER_SYSTEM,
    cacheSystem: true,
    prompt: `Client message:\n"""${text}"""`,
    maxTokens: 300,
  });
}

// The gate. Runs both passes and unions them; the keyword pass is authoritative
// for flagging and the classifier can only ever ADD.
export async function detectHealthFlags(text: string): Promise<HealthFlagResult> {
  if (!text?.trim()) {
    return { flagged: false, categories: [], matched: [], source: "none" };
  }

  const kw = keywordHealthFlags(text);

  let classified: z.infer<typeof ClassificationSchema> | null = null;
  try {
    classified = await classifyHealth(text);
  } catch {
    // Classifier unavailable (no key, outage, invalid output) — degrade to the
    // deterministic pass rather than to "safe".
    classified = null;
  }

  const kwFlagged = kw.categories.length > 0;
  const clFlagged = classified?.flagged === true;
  const categories = Array.from(
    new Set<HealthFlagCategory>([...kw.categories, ...(classified?.categories ?? [])]),
  );

  return {
    flagged: kwFlagged || clFlagged,
    categories,
    matched: kw.matched,
    source:
      kwFlagged && clFlagged
        ? "both"
        : kwFlagged
          ? "keyword"
          : clFlagged
            ? "classifier"
            : "none",
  };
}
