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

  let response = await attempt();
  if (response.parsed_output == null) {
    response = await attempt();
  }
  if (response.parsed_output == null) {
    throw new AiOutputValidationError(params.task, model);
  }
  return response.parsed_output;
}
