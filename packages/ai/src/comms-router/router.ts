import { classifyRoute, type RouteCategory, type RouteClassifier } from "./classifier";
import { keywordEscalation, type EscalationCategory } from "./keywords";

// Phase 6.3 — the two-gate router (MASTER-PLAN G9). Combines the deterministic
// keyword floor (Gate 1) with the Haiku classifier (Gate 2). Fail-closed by
// construction:
//   * EITHER gate firing = escalation; the classifier can never CLEAR a keyword hit;
//   * a classifier error/outage degrades to the keyword result, never to "safe";
//   * confidence below the floor on the classifier → conversational (a human sees
//     it), NEVER routine_autonomous — the router is never autonomous on doubt.

// Below this classifier confidence, a non-escalation message is treated as
// conversational rather than trusted for the autonomous lane.
export const CONFIDENCE_FLOOR = 0.8;

export interface RouteResult {
  category: RouteCategory;
  escalation: boolean;
  /** Which escalation sub-categories fired (for handling/telemetry). */
  escalationCategories: EscalationCategory[];
  /** Self-harm signal → the caller surfaces the crisis-resources card. */
  selfHarm: boolean;
  /** A structural program-change request → the trainer decides (drafted privately). */
  planChange: boolean;
  confidence: number;
  matched: string[];
  /** What drove the ESCALATION decision (mirrors HealthFlagResult.source). */
  source: "keyword" | "classifier" | "both" | "none";
}

export interface RouteDeps {
  classify?: RouteClassifier;
}

function emptyConversational(): RouteResult {
  return {
    category: "conversational",
    escalation: false,
    escalationCategories: [],
    selfHarm: false,
    planChange: false,
    confidence: 0,
    matched: [],
    source: "none",
  };
}

export async function routeMessage(text: string, deps: RouteDeps = {}): Promise<RouteResult> {
  if (!text?.trim()) return emptyConversational();

  const kw = keywordEscalation(text);
  const classify = deps.classify ?? classifyRoute;

  let cl: Awaited<ReturnType<RouteClassifier>> | null = null;
  try {
    cl = await classify(text);
  } catch {
    // Classifier unavailable (no key, outage, invalid output) — degrade to the
    // keyword floor, never to "safe".
    cl = null;
  }

  const kwEscalation = kw.categories.length > 0;
  const clEscalation = cl?.category === "escalation";
  const escalation = kwEscalation || clEscalation;

  let category: RouteCategory;
  if (escalation) {
    category = "escalation";
  } else if (!cl || cl.confidence < CONFIDENCE_FLOOR) {
    // Uncertain (no classifier, or below the floor) → a human sees it. Never
    // routine_autonomous on doubt.
    category = "conversational";
  } else {
    // Confident and non-escalation → trust the classifier's lane.
    category = cl.category;
  }

  const source: RouteResult["source"] = escalation
    ? kwEscalation && clEscalation
      ? "both"
      : kwEscalation
        ? "keyword"
        : "classifier"
    : "none";

  return {
    category,
    escalation,
    escalationCategories: kw.categories,
    selfHarm: kw.selfHarm || cl?.selfHarm === true,
    planChange: kw.categories.includes("plan_change"),
    confidence: kwEscalation ? 1 : (cl?.confidence ?? 0),
    matched: kw.matched,
    source,
  };
}
