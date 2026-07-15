// Model routing per docs/plan/00-MASTER-PLAN.md §4.3 — cost control lives here.
// ~90% of calls are Haiku-tier; the Opus tier is reserved for rare, high-value
// work (monthly plan generation, style ingestion).

export type AiTask = "parse" | "classify" | "draft" | "plan" | "ingest";

export const MODEL_IDS = {
  haiku: "claude-haiku-4-5",
  sonnet: "claude-sonnet-5",
  opus: "claude-opus-4-8",
} as const;

export type ModelId = (typeof MODEL_IDS)[keyof typeof MODEL_IDS];

const TASK_MODEL_MAP: Record<AiTask, ModelId> = {
  // meal text/photo parsing, confirm candidates
  parse: MODEL_IDS.haiku,
  // reply-intent classification, escalation gate 2
  classify: MODEL_IDS.haiku,
  // drafted replies, check-in card selection, weekly summaries
  draft: MODEL_IDS.sonnet,
  // monthly plan generation pipeline
  plan: MODEL_IDS.opus,
  // style-profile ingestion from trainer uploads
  ingest: MODEL_IDS.opus,
};

export function modelRouter(task: AiTask): ModelId {
  const model = TASK_MODEL_MAP[task];
  if (!model) {
    throw new Error(`Unknown AI task type: ${String(task)}`);
  }
  return model;
}
