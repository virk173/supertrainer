import Anthropic from "@anthropic-ai/sdk";

import { currentAiTask, recordGeneration } from "./tracing";

// Phase 0.5 wraps this factory with Langfuse tracing — keep all client
// construction here so tracing covers every call site. The wrapper is a Proxy
// so it preserves the full Anthropic type surface and mutates nothing; it only
// instruments the Promise-returning `messages.create` / `messages.parse`.
let client: Anthropic | null = null;

type AnyAsyncFn = (...args: unknown[]) => Promise<unknown>;

// Anthropic responses (both Message and ParsedMessage) carry usage token counts.
function readUsage(result: unknown): {
  inputTokens?: number;
  outputTokens?: number;
} {
  const usage = (
    result as { usage?: { input_tokens?: number; output_tokens?: number } }
  )?.usage;
  return { inputTokens: usage?.input_tokens, outputTokens: usage?.output_tokens };
}

function traceCall(original: AnyAsyncFn, thisArg: unknown): AnyAsyncFn {
  return async (...args: unknown[]) => {
    const params = (args[0] ?? {}) as { model?: string; messages?: unknown };
    const model = typeof params.model === "string" ? params.model : "unknown";
    const task = currentAiTask();
    const startTime = new Date();
    try {
      const result = await original.apply(thisArg, args);
      const { inputTokens, outputTokens } = readUsage(result);
      recordGeneration({
        task,
        model,
        startTime,
        endTime: new Date(),
        inputTokens,
        outputTokens,
        input: params.messages,
        output: (result as { content?: unknown; parsed_output?: unknown })
          ?.content ??
          (result as { parsed_output?: unknown })?.parsed_output ??
          result,
      });
      return result;
    } catch (error) {
      recordGeneration({ task, model, startTime, endTime: new Date(), error });
      throw error;
    }
  };
}

function instrument(anthropic: Anthropic): Anthropic {
  return new Proxy(anthropic, {
    get(target, prop, receiver) {
      if (prop !== "messages") {
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      }
      const messages = target.messages;
      return new Proxy(messages, {
        get(msgTarget, msgProp, msgReceiver) {
          const value = Reflect.get(msgTarget, msgProp, msgReceiver);
          // Only wrap the Promise-returning entry points. `.stream` returns a
          // MessageStream (not a Promise) and must pass through untouched.
          if (
            (msgProp === "create" || msgProp === "parse") &&
            typeof value === "function"
          ) {
            return traceCall(value as AnyAsyncFn, msgTarget);
          }
          return typeof value === "function" ? value.bind(msgTarget) : value;
        },
      });
    },
  });
}

export function getClaudeClient(): Anthropic {
  if (!client) {
    // Resolves credentials from the environment (ANTHROPIC_API_KEY).
    client = instrument(new Anthropic());
  }
  return client;
}
