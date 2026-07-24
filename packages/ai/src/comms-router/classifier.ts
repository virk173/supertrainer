import { z } from "zod";

import { zodOutput } from "../zodOutput";

// Phase 6.3 — the routing classifier (Gate 2). A Haiku pass that categorizes the
// latest client message and reports its confidence. EITHER this OR the keyword
// floor firing = escalation; a confidence below the floor is treated as
// conversational (a human sees it) — never autonomous on doubt.

export const ROUTE_CATEGORIES = [
  "escalation",
  "routine_autonomous",
  "conversational",
  "plan_impact",
] as const;
export type RouteCategory = (typeof ROUTE_CATEGORIES)[number];

const RoutingSchema = z.object({
  category: z.enum(ROUTE_CATEGORIES),
  confidence: z.number().min(0).max(1),
  selfHarm: z.boolean().default(false),
});
export type RoutingClassification = z.infer<typeof RoutingSchema>;

// Injectable so CI drives the router's control flow with a deterministic fake.
export type RouteClassifier = (text: string) => Promise<RoutingClassification>;

const SYSTEM = `You route messages a personal-training client sends their coach. Classify ONLY the latest client message into exactly one category, and report how confident you are.

Categories:
- escalation: anything that needs a HUMAN coach rather than an AI — injury, pain, dizziness, chest or breathing trouble, any medical condition or medication, pregnancy, emotional distress or self-harm signals, OR a request to change the STRUCTURE of their program ("switch me to 3 days", "change my split"). When torn between escalation and anything else, choose escalation.
- routine_autonomous: a simple factual lookup or acknowledgement an assistant can answer instantly and safely — "what's my lunch today?", "when's my next session?", "what's my protein target?", "logged it", "thanks", "got it".
- plan_impact: a question whose answer depends on their current plan targets or today's logged intake — "can I eat out tonight?", "can I skip breakfast?", "how many carbs do I have left?". This is a QUESTION about the plan, not a request to CHANGE it (that is escalation).
- conversational: general chat, motivation, opinions, or anything else best drafted for the coach to review.

Also set selfHarm=true if the message contains ANY self-harm or suicidal signal, however faint.

Rules:
- If you are unsure, prefer escalation, then conversational. NEVER routine_autonomous on any doubt.
- Ordinary soreness, tiredness, or gym slang ("this workout killed me", "legs are dead") is NOT escalation.
- confidence (0..1) is how sure you are of the chosen category.`;

export async function classifyRoute(text: string): Promise<RoutingClassification> {
  return zodOutput(RoutingSchema, {
    task: "classify",
    system: SYSTEM,
    cacheSystem: true,
    prompt: `Client message:\n"""${text}"""`,
    maxTokens: 200,
  });
}
