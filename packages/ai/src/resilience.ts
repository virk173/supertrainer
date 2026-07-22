import { MODEL_IDS, type AiTask } from "./modelRouter";

// PO-4 — AI resilience layer. modelRouter was a static task→single-model map with
// no retry/fallback/breaker: an Anthropic 529, a 5xx, or exhausted credits took
// down whatever it touched — the prospect mid-teaser and the client mid-interview,
// the two highest-intent funnel moments, silently failing. This centralizes:
//   1. retry with exponential backoff on transient errors,
//   2. an optional cheaper-model fallback on overload/5xx (draft Sonnet → Haiku),
//   3. a PER-MODEL circuit breaker that fails fast during that model's outage
//      (and lets a call skip a known-down model straight to its fallback), and
//   4. an "AI degraded" flag the funnel can read for honest holding copy.
// CAVEAT (from the audit): a same-provider tier fallback does NOT cure credit
// exhaustion — every Anthropic model shares one balance — so a credit error skips
// the fallback and trips the breaker directly.

export type AiErrorKind =
  | "overload"
  | "rate_limit"
  | "credit"
  | "server"
  | "auth"
  | "invalid_request"
  | "other";

// Classifies a thrown error by its API signal. Duck-typed against the Anthropic
// SDK's error shape (a numeric `status`, an `error.type`/message body, and the
// error's `name` for connection failures that carry no status).
export function classifyAiError(err: unknown): AiErrorKind {
  if (err instanceof AiDegradedError) return "overload";
  const e = err as {
    status?: number;
    name?: string;
    message?: string;
    error?: { type?: string; message?: string };
  };
  const status = typeof e?.status === "number" ? e.status : undefined;
  const type = e?.error?.type ?? "";
  const name = e?.name ?? "";
  const msg = `${e?.message ?? ""} ${e?.error?.message ?? ""}`.toLowerCase();

  // Credit exhaustion is a 400 with a distinctive message — not retryable and not
  // curable by a same-provider fallback (shared balance).
  if (msg.includes("credit balance") || type === "billing") return "credit";
  if (status === 429 || type === "rate_limit_error") return "rate_limit";
  if (status === 529 || type === "overloaded_error") return "overload";
  // Connection failures carry no HTTP status — treat as a retryable server blip
  // (the SDK's own retries are disabled in claude.ts so this layer owns retry).
  if (name === "APIConnectionError" || name === "APIConnectionTimeoutError") return "server";
  if (status !== undefined && status >= 500) return "server";
  if (status === 401 || status === 403) return "auth"; // bad/blocked key → total outage
  if (status !== undefined && status >= 400) return "invalid_request"; // per-request problem
  // No status → a messages.parse schema/refusal throw or a generic Error.
  return "other";
}

// Transient kinds worth retrying. Credit/auth/invalid_request/other are terminal.
export function isRetryable(kind: AiErrorKind): boolean {
  return kind === "rate_limit" || kind === "overload" || kind === "server";
}

// Kinds where a different (cheaper) model might succeed. NOT credit (shared
// balance), auth (shared key), or invalid_request (the request itself is bad).
export function isFallbackEligible(kind: AiErrorKind): boolean {
  return kind === "rate_limit" || kind === "overload" || kind === "server";
}

// True for any error that reflects API health, so a caller can distinguish a hard
// API failure (propagate) from a schema/refusal miss (retry once).
export function isAiApiError(err: unknown): boolean {
  return err instanceof AiDegradedError || classifyAiError(err) !== "other";
}

// A per-request problem (a bad prompt / bad model id, `invalid_request`) is not a
// broad-outage signal, so it must not trip the breaker; a schema miss (`other`)
// isn't an API failure at all.
function tripsBreaker(kind: AiErrorKind): boolean {
  return kind !== "other" && kind !== "invalid_request";
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
// (fail fast) for `cooldownMs`, then half-opens to admit exactly ONE trial (a
// single-flight guard, so a burst under load doesn't stampede a still-down API).
// Any success resets it. Process-local by design (per serverless instance) —
// enough to stop hammering a down model and to drive the degraded flag.
export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private halfOpenInFlight = false;

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
    const s = this.state();
    if (s === "open") return false;
    if (s === "half_open") {
      if (this.halfOpenInFlight) return false; // single-flight the recovery probe
      this.halfOpenInFlight = true;
      return true;
    }
    return true; // closed
  }

  // Degraded = actively failing (open) or mid-recovery (half-open, awaiting a
  // successful trial). The funnel shows holding copy for both.
  isDegraded(): boolean {
    return this.state() !== "closed";
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openedAt = 0;
    this.halfOpenInFlight = false;
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.failures >= this.threshold) this.openedAt = this.now();
    this.halfOpenInFlight = false;
  }

  // Releases a claimed half-open probe WITHOUT recording an outcome — for a call
  // that resolved with something that isn't an API-health signal (a schema/refusal
  // miss, or a per-request invalid_request). Without this, such a probe would
  // leave halfOpenInFlight stuck true and brick the breaker (allowRequest forever
  // false, isAiDegraded forever true). The next call re-probes.
  releaseProbe(): void {
    this.halfOpenInFlight = false;
  }

  reset(): void {
    this.failures = 0;
    this.openedAt = 0;
    this.halfOpenInFlight = false;
  }
}

// Per-model breakers: an outage in one model (Sonnet drafts / Opus ingest) must
// not fail-fast healthy calls to another (the Haiku health classifier especially,
// which the interview engine intends to always run). A draft call whose primary
// (Sonnet) breaker is open skips straight to its Haiku fallback.
const breakers = new Map<string, CircuitBreaker>();
function breakerFor(model: string): CircuitBreaker {
  let b = breakers.get(model);
  if (!b) {
    b = new CircuitBreaker();
    breakers.set(model, b);
  }
  return b;
}

// The funnel's "AI degraded" flag: true when any model we've touched is currently
// unhealthy. Combined with a "generation failed" check at the call site, this
// distinguishes a real outage from an ordinary one-off miss.
export function isAiDegraded(): boolean {
  for (const b of breakers.values()) if (b.isDegraded()) return true;
  return false;
}

export function resetAiCircuitForTests(): void {
  breakers.clear();
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
  /** Resolves the breaker for a model. Defaults to the per-model registry. */
  getBreaker?: (model: string) => CircuitBreaker;
}

// Tries `primaryModel`, then (on a fallback-eligible failure and a defined
// fallbackModel) the cheaper model — each with retry/backoff, each gated by and
// recorded against ITS OWN breaker, and skipping any model whose breaker is open.
// A non-API ("other") error — a schema/refusal miss — passes straight through
// WITHOUT retry, fallback, or tripping the breaker, so the caller's own
// schema-retry handles it. Throws AiDegradedError only when every model's breaker
// is open (nothing was attempted).
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
    getBreaker = breakerFor,
  } = opts;

  const models = fallbackModel ? [primaryModel, fallbackModel] : [primaryModel];
  let lastApiErr: unknown = null;

  for (const model of models) {
    const breaker = getBreaker(model);
    if (!breaker.allowRequest()) continue; // skip a known-down model

    try {
      const result = await withRetry(() => callModel(model), attempts, baseDelayMs, sleep);
      breaker.recordSuccess();
      return result;
    } catch (err) {
      const kind = classifyAiError(err);
      if (kind === "other") {
        // A schema/refusal miss — not an API-health signal. Release the half-open
        // probe (if this was one) so the breaker isn't bricked. On the primary with
        // no prior API error, propagate it so zodOutput's schema-retry handles it;
        // but if a prior model already failed with a real API error, a fallback
        // schema miss must NOT mask that outage — surface the API error instead.
        breaker.releaseProbe();
        if (lastApiErr) throw lastApiErr;
        throw err;
      }
      // A real API error: a broad-outage kind trips the breaker; a per-request
      // invalid_request does not — but either way, release a claimed half-open
      // probe (recordFailure releases it too; releaseProbe covers the else).
      if (tripsBreaker(kind)) breaker.recordFailure();
      else breaker.releaseProbe();
      lastApiErr = err;
      // Only a fallback-eligible outage is worth trying the next model for; a
      // credit/auth/invalid_request error would fail the fallback the same way.
      if (!isFallbackEligible(kind)) break;
    }
  }

  if (lastApiErr) throw lastApiErr; // every attempted model failed with an API error
  throw new AiDegradedError(); // every model's breaker was open — nothing attempted
}
