import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

import { getClaudeClient } from "./claude";
import { modelRouter, type AiTask } from "./modelRouter";
import {
  callWithResilience,
  fallbackModelFor,
  isAiApiError,
} from "./resilience";
import { withAiTask } from "./tracing";

export interface ZodOutputParams {
  task: AiTask;
  prompt: string;
  system?: string;
  maxTokens?: number;
  /**
   * Cache the system prompt (prompt caching). Set for stable, reused system
   * prompts — e.g. the style-extraction instructions injected on every upload.
   * The variable content must live in `prompt`, never `system`.
   */
  cacheSystem?: boolean;
}

export class AiOutputValidationError extends Error {
  constructor(
    public readonly task: AiTask,
    public readonly model: string,
  ) {
    super(
      `AI output failed schema validation after retry (task=${task}, model=${model})`,
    );
    this.name = "AiOutputValidationError";
  }
}

// Requests schema-constrained JSON (structured outputs) and validates with
// Zod. Retries once on validation failure, then throws — callers must never
// receive unvalidated AI output (CLAUDE.md rule 5).
export async function zodOutput<T>(
  schema: z.ZodType<T>,
  params: ZodOutputParams,
): Promise<T> {
  const client = getClaudeClient();
  const model = modelRouter(params.task);

  // A cached system prompt is sent as a text block with cache_control so the
  // stable prefix is reused across calls (e.g. every upload extraction).
  const system = params.system
    ? params.cacheSystem
      ? [
          {
            type: "text" as const,
            text: params.system,
            cache_control: { type: "ephemeral" as const },
          },
        ]
      : params.system
    : undefined;

  // One call to one model, run inside the task context so the traced client
  // (claude.ts) tags the generation with the AiTask + the model actually used.
  const callModel = (useModel: string) =>
    withAiTask(params.task, () =>
      client.messages.parse({
        model: useModel,
        max_tokens: params.maxTokens ?? 16000,
        ...(system ? { system } : {}),
        messages: [{ role: "user", content: params.prompt }],
        output_config: { format: zodOutputFormat(schema) },
      }),
    );

  // PO-4: route the API call through the resilience layer — retry/backoff on
  // transient errors, a cheaper-model fallback on overload (draft Sonnet → Haiku),
  // and a circuit breaker that fails fast during a broad outage. Schema/refusal
  // misses are NOT API errors: callWithResilience re-throws them untouched, and
  // the retry-once-then-throw contract below handles them exactly as before.
  const fallbackModel = fallbackModelFor(params.task);
  const tryOnce = async (): Promise<T | null> => {
    try {
      const response = await callWithResilience(callModel, {
        primaryModel: model,
        fallbackModel,
      });
      return response.parsed_output ?? null;
    } catch (err) {
      // A hard API failure or an open breaker must propagate (so best-effort
      // callers degrade and the funnel can show honest holding copy) rather than
      // be masked as a schema-validation retry. Only a schema/refusal miss is
      // retried.
      if (isAiApiError(err)) throw err;
      return null;
    }
  };

  const first = await tryOnce();
  if (first !== null) return first;

  const second = await tryOnce();
  if (second !== null) return second;

  throw new AiOutputValidationError(params.task, model);
}
