import { MODEL_IDS, type AiTask } from "./modelRouter";

// PO-4 — AI resilience layer. modelRouter was a static task→single-model map with
// no retry/fallback/breaker: an Anthropic 529, a 5xx, or exhausted credits took
// down whatever it touched — the prospect mid-teaser and the client mid-interview,
// the two highest-intent funnel moments, silently failing. This centralizes:
//   1. retry with exponential backoff on transient errors,
//   2. an optional cheaper-model fallback on overload/5xx (draft Sonnet → Haiku),
//   3. a short circuit breaker that fails fast during a broad outage, and
//   4. a process-local "AI degraded" flag the funnel can read for honest holding
//      copy.
// CAVEAT (from the audit): a same-provider tier fallback does NOT cure credit
// exhaustion — every Anthropic model shares one balance — so a credit error skips
// the fallback and trips the breaker directly.

export type AiErrorKind = "overload" | "rate_limit" | "credit" | "server" | "other";

// Classifies a thrown error by its API signal. Duck-typed against the Anthropic
// SDK's error shape (a numeric `status`, and an `error.type`/message body) so we
// don't couple to a specific SDK error class.
export function classifyAiError(err: unknown): AiErrorKind {
  if (err instanceof AiDegradedError) return "overload";
  const e = err as {
    status?: number;
    message?: string;
    error?: { type?: string; message?: string };
  };
  const status = typeof e?.status === "number" ? e.status : undefined;
  const type = e?.error?.type ?? "";
  const msg = `${e?.message ?? ""} ${e?.error?.message ?? ""}`.toLowerCase();

  // Credit exhaustion is a 400 with a distinctive message — not retryable and not
  // curable by a same-provider fallback.
  if (msg.includes("credit balance") || type === "billing") return "credit";
  if (status === 429 || type === "rate_limit_error") return "rate_limit";
  if (status === 529 || type === "overloaded_error") return "overload";
  if (status !== undefined && status >= 500) return "server";
  return "other";
}

// Transient kinds worth retrying. Credit/other are terminal for this call.
export function isRetryable(kind: AiErrorKind): boolean {
  return kind === "rate_limit" || kind === "overload" || kind === "server";
}

// Kinds where a different (cheaper) model might succeed. NOT credit — the balance
// is shared, so Haiku fails the same way.
export function isFallbackEligible(kind: AiErrorKind): boolean {
  return kind === "rate_limit" || kind === "overload" || kind === "server";
}

// True for any error that reflects API health (so callers can distinguish a hard
// API failure — propagate — from a schema/refusal miss — retry once).
export function isAiApiError(err: unknown): boolean {
  return err instanceof AiDegradedError || classifyAiError(err) !== "other";
}

// The cheaper same-provider fallback for a task, or undefined. Only the Sonnet
// 'draft' tier has a meaningfully-cheaper substitute; classify/parse are already
// Haiku, and plan/ingest are Opus with no acceptable cheaper stand-in.
export function fallbackModelFor(task: AiTask): string | undefined {
  return task === "draft" ? MODEL_IDS.haiku : undefined;
}

export class AiDegradedError extends Error {
  constructor() {
    super("AI is temporarily degraded — the circuit breaker is open.");
    this.name = "AiDegradedError";
  }
}

// A minimal circuit breaker. After `threshold` consecutive API failures it opens
// (fail fast) for `cooldownMs`, then half-opens to allow one trial. Any success
// resets it. Process-local by design (per serverless instance) — enough to stop
// hammering a down API and to drive the degraded flag; it is not cluster-wide.
export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;

  constructor(
    private readonly threshold = 5,
    private readonly cooldownMs = 30_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  state(): "closed" | "open" | "half_open" {
    if (this.failures < this.threshold) return "closed";
    return this.now() - this.openedAt >= this.cooldownMs ? "half_open" : "open";
  }

  allowRequest(): boolean {
    return this.state() !== "open";
  }

  // Degraded = actively failing (open) or mid-recovery (half-open, awaiting a
  // successful trial). The funnel shows holding copy for both.
  isDegraded(): boolean {
    return this.state() !== "closed";
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openedAt = 0;
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.failures >= this.threshold) this.openedAt = this.now();
  }

  reset(): void {
    this.failures = 0;
    this.openedAt = 0;
  }
}

// Process-global breaker + degraded flag the funnel reads.
const globalBreaker = new CircuitBreaker();
export function isAiDegraded(): boolean {
  return globalBreaker.isDegraded();
}
export function resetAiCircuitForTests(): void {
  globalBreaker.reset();
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function withRetry<T>(
  fn: () => Promise<T>,
  attempts: number,
  baseDelayMs: number,
  sleep: (ms: number) => Promise<void>,
): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts - 1 || !isRetryable(classifyAiError(err))) throw err;
      const backoff = baseDelayMs * 2 ** i + Math.floor(Math.random() * baseDelayMs);
      await sleep(backoff);
    }
  }
}

export interface ResilienceOpts {
  primaryModel: string;
  fallbackModel?: string;
  attempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  breaker?: CircuitBreaker;
}

// Runs `callModel(primaryModel)` with retry/backoff; on a fallback-eligible
// failure and a defined fallbackModel, retries once through the cheaper model;
// records the outcome to the circuit breaker; and fails fast (AiDegradedError)
// while the breaker is open. Non-API ("other") errors — e.g. a schema/refusal
// miss — pass straight through WITHOUT retry or tripping the breaker, so the
// caller's own schema-retry handles them.
export async function callWithResilience<T>(
  callModel: (model: string) => Promise<T>,
  opts: ResilienceOpts,
): Promise<T> {
  const {
    primaryModel,
    fallbackModel,
    attempts = 3,
    baseDelayMs = 250,
    sleep = defaultSleep,
    breaker = globalBreaker,
  } = opts;

  if (!breaker.allowRequest()) throw new AiDegradedError();

  const run = (model: string) => withRetry(() => callModel(model), attempts, baseDelayMs, sleep);

  try {
    const result = await run(primaryModel);
    breaker.recordSuccess();
    return result;
  } catch (primaryErr) {
    const kind = classifyAiError(primaryErr);
    if (kind === "other") throw primaryErr; // not an API-health failure

    if (fallbackModel && isFallbackEligible(kind)) {
      try {
        const result = await run(fallbackModel);
        breaker.recordSuccess();
        return result;
      } catch (fallbackErr) {
        if (classifyAiError(fallbackErr) !== "other") breaker.recordFailure();
        throw fallbackErr;
      }
    }

    breaker.recordFailure();
    throw primaryErr;
  }
}
