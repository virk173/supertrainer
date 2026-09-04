import "server-only";

import { costMicros, setAiUsageSink, type AiUsageRecord } from "@supertrainer/ai";

import { createServiceClient } from "@/lib/supabase/server";

// Phase 9.3 — the margin meter's write side. Every traced Claude call lands here
// with its token counts; we price it in code and append to ai_usage.
//
// Two rules make this safe to leave in the hot path:
//  1. it never throws into the AI call (a metering failure is not a product
//     failure), and
//  2. it never awaits inside the caller — rows are buffered and flushed on a
//     microtask, so a slow insert cannot add latency to a client's reply.
//
// A call made outside withAiOrg() lands with org_id null. That is deliberate:
// "unattributed" is honest, whereas guessing an org would corrupt the ledger the
// throttle decisions are made from.

interface Pending {
  org_id: string | null;
  task: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_micros: number;
}

const buffer: Pending[] = [];
let flushing = false;

async function flush(): Promise<void> {
  if (flushing || buffer.length === 0) return;
  flushing = true;
  const batch = buffer.splice(0, buffer.length);
  try {
    const service = createServiceClient();
    await service.from("ai_usage").insert(batch);
  } catch (err) {
    console.error("[ai-usage] flush failed", err);
  } finally {
    flushing = false;
    if (buffer.length > 0) void flush();
  }
}

export function toRow(record: AiUsageRecord): Pending {
  return {
    org_id: record.orgId ?? null,
    task: record.task ?? null,
    model: record.model,
    input_tokens: record.inputTokens,
    output_tokens: record.outputTokens,
    cost_micros: costMicros(record.model, record.inputTokens, record.outputTokens),
  };
}

let installed = false;

/** Install the process-wide sink. Idempotent — instrumentation may run twice. */
export function installAiUsageSink(): void {
  if (installed) return;
  installed = true;
  setAiUsageSink((record) => {
    buffer.push(toRow(record));
    queueMicrotask(() => void flush());
  });
}

/** Drain the buffer — for serverless handlers that are about to freeze. */
export async function flushAiUsage(): Promise<void> {
  await flush();
}
