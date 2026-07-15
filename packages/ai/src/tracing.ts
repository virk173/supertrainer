// Langfuse LLM tracing (Phase 0.5). Every Claude call routed through
// getClaudeClient() is traced with model, latency, token usage, and task tag;
// Langfuse computes cost from the model + token usage using the per-model
// prices configured in the Langfuse project (Settings → Models).
//
// Design notes:
// - Fully no-ops when LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY are unset, so
//   local dev, CI, and tests run untouched without credentials.
// - Never throws into the caller: a tracing failure must not break an AI call.
// - The AiTask tag isn't visible at the Anthropic call boundary, so callers run
//   inside withAiTask() and the traced client reads it from AsyncLocalStorage.

import { AsyncLocalStorage } from "node:async_hooks";

import { Langfuse } from "langfuse";

import type { AiTask } from "./modelRouter";

// ── Task context ─────────────────────────────────────────────────────────────

const taskStore = new AsyncLocalStorage<AiTask>();

/** Run `fn` so any Claude call it makes is tagged with `task` in Langfuse. */
export function withAiTask<T>(task: AiTask, fn: () => T): T {
  return taskStore.run(task, fn);
}

/** The AiTask of the currently executing traced call, if any. */
export function currentAiTask(): AiTask | undefined {
  return taskStore.getStore();
}

// ── Langfuse client (lazy, credential-gated singleton) ───────────────────────

// undefined = not yet resolved, null = disabled (no credentials).
let langfuse: Langfuse | null | undefined;

function getLangfuse(): Langfuse | null {
  if (langfuse !== undefined) return langfuse;

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  if (!publicKey || !secretKey) {
    langfuse = null;
    return null;
  }

  langfuse = new Langfuse({
    publicKey,
    secretKey,
    // Optional self-hosted URL; defaults to Langfuse Cloud when unset.
    ...(process.env.LANGFUSE_HOST ? { baseUrl: process.env.LANGFUSE_HOST } : {}),
  });
  return langfuse;
}

// ── Generation recording ─────────────────────────────────────────────────────

export interface GenerationRecord {
  task?: AiTask;
  model: string;
  startTime: Date;
  endTime: Date;
  /** Anthropic usage.input_tokens */
  inputTokens?: number;
  /** Anthropic usage.output_tokens */
  outputTokens?: number;
  input?: unknown;
  output?: unknown;
  error?: unknown;
}

/**
 * Enqueue one generation to Langfuse. Latency is derived from start/end times;
 * cost is computed by Langfuse from `model` + token usage. Safe to call
 * unconditionally — no-ops without credentials and never throws.
 */
export function recordGeneration(record: GenerationRecord): void {
  const client = getLangfuse();
  if (!client) return;

  try {
    const usageDetails =
      record.inputTokens != null || record.outputTokens != null
        ? {
            input: record.inputTokens ?? 0,
            output: record.outputTokens ?? 0,
            total: (record.inputTokens ?? 0) + (record.outputTokens ?? 0),
          }
        : undefined;

    client.generation({
      name: record.task ? `claude:${record.task}` : "claude",
      model: record.model,
      startTime: record.startTime,
      endTime: record.endTime,
      input: record.input,
      output: record.output,
      ...(usageDetails ? { usageDetails } : {}),
      ...(record.task ? { metadata: { task: record.task } } : {}),
      level: record.error ? "ERROR" : "DEFAULT",
      ...(record.error ? { statusMessage: String(record.error) } : {}),
    });
  } catch {
    // Tracing must never break an AI call.
  }
}

/**
 * Flush pending traces. Serverless callers (route handlers, server actions)
 * should `await flushTracing()` after their AI work so events aren't dropped
 * when the function freezes. No-ops without credentials.
 */
export async function flushTracing(): Promise<void> {
  const client = getLangfuse();
  if (!client) return;
  try {
    await client.flushAsync();
  } catch {
    // ignore flush failures
  }
}
