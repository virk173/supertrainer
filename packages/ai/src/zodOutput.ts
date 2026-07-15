import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

import { getClaudeClient } from "./claude";
import { modelRouter, type AiTask } from "./modelRouter";

export interface ZodOutputParams {
  task: AiTask;
  prompt: string;
  system?: string;
  maxTokens?: number;
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

  const attempt = () =>
    client.messages.parse({
      model,
      max_tokens: params.maxTokens ?? 16000,
      ...(params.system ? { system: params.system } : {}),
      messages: [{ role: "user", content: params.prompt }],
      output_config: { format: zodOutputFormat(schema) },
    });

  // A schema-validation failure surfaces two ways depending on the SDK path:
  // messages.parse() THROWS a parse/validation error, or it resolves with a
  // null parsed_output (e.g. a refusal or unparseable turn). Treat both as a
  // failed attempt so the retry-once-then-throw contract holds either way.
  const tryOnce = async (): Promise<T | null> => {
    try {
      const response = await attempt();
      return response.parsed_output ?? null;
    } catch {
      return null;
    }
  };

  const first = await tryOnce();
  if (first !== null) return first;

  const second = await tryOnce();
  if (second !== null) return second;

  throw new AiOutputValidationError(params.task, model);
}
