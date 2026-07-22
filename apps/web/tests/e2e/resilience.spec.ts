import { expect, test } from "@playwright/test";

import {
  AiDegradedError,
  CircuitBreaker,
  callWithResilience,
  classifyAiError,
  fallbackModelFor,
  isAiApiError,
  isFallbackEligible,
  isRetryable,
} from "../../../../packages/ai/src/resilience";

// PO-4 — AI resilience layer (node-level, no browser, no live AI).

const noSleep = async () => {};
const apiErr = (status: number, message = "") => ({ status, message });

test("classifyAiError maps API signals", () => {
  expect(classifyAiError(apiErr(429))).toBe("rate_limit");
  expect(classifyAiError(apiErr(529))).toBe("overload");
  expect(classifyAiError(apiErr(500))).toBe("server");
  expect(classifyAiError(apiErr(503))).toBe("server");
  expect(classifyAiError({ status: 400, error: { message: "Your credit balance is too low" } })).toBe("credit");
  expect(classifyAiError({ error: { type: "overloaded_error" } })).toBe("overload");
  expect(classifyAiError(apiErr(401))).toBe("auth");
  expect(classifyAiError(apiErr(403))).toBe("auth");
  expect(classifyAiError(apiErr(400, "prompt is too long"))).toBe("invalid_request");
  expect(classifyAiError(apiErr(404))).toBe("invalid_request");
  expect(classifyAiError({ name: "APIConnectionError" })).toBe("server"); // retryable connection blip
  expect(classifyAiError(new Error("schema mismatch"))).toBe("other"); // no status → schema/parse miss
  expect(classifyAiError(new AiDegradedError())).toBe("overload");
});

test("retryable / fallback / api-error predicates", () => {
  expect(isRetryable("overload")).toBe(true);
  expect(isRetryable("credit")).toBe(false);
  expect(isRetryable("auth")).toBe(false);
  expect(isRetryable("invalid_request")).toBe(false);
  expect(isRetryable("other")).toBe(false);
  expect(isFallbackEligible("overload")).toBe(true);
  expect(isFallbackEligible("credit")).toBe(false); // shared balance
  expect(isFallbackEligible("auth")).toBe(false); // shared key
  expect(isAiApiError(apiErr(529))).toBe(true);
  expect(isAiApiError(apiErr(401))).toBe(true); // a hard API failure, not a schema miss
  expect(isAiApiError(new Error("schema"))).toBe(false);
  expect(isAiApiError(new AiDegradedError())).toBe(true);
  expect(fallbackModelFor("draft")).toBeTruthy();
  expect(fallbackModelFor("classify")).toBeUndefined();
});

test("circuit breaker opens after the threshold, half-opens after cooldown, resets on success", () => {
  let clock = 0;
  const b = new CircuitBreaker(3, 1000, () => clock);
  expect(b.state()).toBe("closed");
  b.recordFailure();
  b.recordFailure();
  expect(b.state()).toBe("closed"); // 2 < 3
  b.recordFailure(); // 3rd → opens
  expect(b.state()).toBe("open");
  expect(b.allowRequest()).toBe(false);
  expect(b.isDegraded()).toBe(true);

  clock += 1000; // cooldown elapses
  expect(b.state()).toBe("half_open");

  b.recordSuccess(); // trial succeeds → closed
  expect(b.state()).toBe("closed");
  expect(b.isDegraded()).toBe(false);
});

test("half-open admits only ONE trial (single-flight), not a stampede", () => {
  let clock = 0;
  const b = new CircuitBreaker(1, 1000, () => clock);
  b.recordFailure(); // opens
  clock += 1000; // → half_open
  expect(b.allowRequest()).toBe(true); // first caller claims the probe
  expect(b.allowRequest()).toBe(false); // concurrent callers are turned away
  expect(b.allowRequest()).toBe(false);
});

const shared = (b: CircuitBreaker) => ({ getBreaker: () => b });

test("callWithResilience: retries a transient error then succeeds", async () => {
  let calls = 0;
  const result = await callWithResilience(
    async () => {
      calls += 1;
      if (calls < 3) throw apiErr(529);
      return "ok";
    },
    { primaryModel: "sonnet", attempts: 3, baseDelayMs: 0, sleep: noSleep, ...shared(new CircuitBreaker()) },
  );
  expect(result).toBe("ok");
  expect(calls).toBe(3);
});

test("callWithResilience: falls back to the cheaper model on persistent overload", async () => {
  const seen: string[] = [];
  const result = await callWithResilience(
    async (model) => {
      seen.push(model);
      if (model === "sonnet") throw apiErr(529);
      return "haiku-ok";
    },
    { primaryModel: "sonnet", fallbackModel: "haiku", attempts: 2, baseDelayMs: 0, sleep: noSleep, ...shared(new CircuitBreaker()) },
  );
  expect(result).toBe("haiku-ok");
  expect(seen.filter((m) => m === "sonnet").length).toBe(2); // retried primary
  expect(seen).toContain("haiku");
});

test("callWithResilience: a per-model open breaker skips straight to the healthy fallback", async () => {
  const sonnetB = new CircuitBreaker(1, 60_000);
  sonnetB.recordFailure(); // Sonnet is known-down
  const haikuB = new CircuitBreaker();
  const seen: string[] = [];
  const result = await callWithResilience(
    async (model) => {
      seen.push(model);
      return `${model}-ok`;
    },
    {
      primaryModel: "sonnet",
      fallbackModel: "haiku",
      getBreaker: (m) => (m === "sonnet" ? sonnetB : haikuB),
    },
  );
  expect(result).toBe("haiku-ok");
  expect(seen).toEqual(["haiku"]); // Sonnet never called — its breaker is open
});

test("callWithResilience: a fallback schema miss does NOT mask the primary outage", async () => {
  const breaker = new CircuitBreaker();
  await expect(
    callWithResilience(
      async (model) => {
        if (model === "sonnet") throw apiErr(529); // real outage
        throw new Error("haiku returned unparseable json"); // schema miss on fallback
      },
      { primaryModel: "sonnet", fallbackModel: "haiku", attempts: 1, baseDelayMs: 0, sleep: noSleep, ...shared(breaker) },
    ),
  ).rejects.toMatchObject({ status: 529 }); // the API outage surfaces, not the schema error
  expect(breaker.isDegraded()).toBe(false); // one failure < threshold, but it WAS recorded
});

test("callWithResilience: a credit error skips the fallback and trips the breaker", async () => {
  const seen: string[] = [];
  const breaker = new CircuitBreaker(1, 1000); // trips on first failure
  await expect(
    callWithResilience(
      async (model) => {
        seen.push(model);
        throw { status: 400, error: { message: "credit balance too low" } };
      },
      { primaryModel: "sonnet", fallbackModel: "haiku", attempts: 3, baseDelayMs: 0, sleep: noSleep, ...shared(breaker) },
    ),
  ).rejects.toBeTruthy();
  expect(seen).toEqual(["sonnet"]); // no retry, no fallback (shared balance)
  expect(breaker.isDegraded()).toBe(true);
});

test("callWithResilience: an invalid_request error does not trip the breaker or fall back", async () => {
  const seen: string[] = [];
  const breaker = new CircuitBreaker(1, 1000);
  await expect(
    callWithResilience(
      async (model) => {
        seen.push(model);
        throw apiErr(400, "prompt is too long");
      },
      { primaryModel: "sonnet", fallbackModel: "haiku", attempts: 3, baseDelayMs: 0, sleep: noSleep, ...shared(breaker) },
    ),
  ).rejects.toMatchObject({ status: 400 });
  expect(seen).toEqual(["sonnet"]); // a per-request problem — fallback won't help
  expect(breaker.isDegraded()).toBe(false); // must NOT degrade the whole system
});

test("callWithResilience: a schema ('other') error passes through without retry or tripping the breaker", async () => {
  let calls = 0;
  const breaker = new CircuitBreaker(1, 1000);
  await expect(
    callWithResilience(
      async () => {
        calls += 1;
        throw new Error("schema validation failed");
      },
      { primaryModel: "sonnet", fallbackModel: "haiku", attempts: 3, baseDelayMs: 0, sleep: noSleep, ...shared(breaker) },
    ),
  ).rejects.toThrow(/schema/);
  expect(calls).toBe(1); // no retry
  expect(breaker.isDegraded()).toBe(false); // not an API-health failure
});

test("callWithResilience: fails fast (AiDegradedError) when every model's breaker is open", async () => {
  const open = new CircuitBreaker(1, 60_000);
  open.recordFailure(); // opens it
  let called = false;
  await expect(
    callWithResilience(
      async () => {
        called = true;
        return "should-not-run";
      },
      { primaryModel: "sonnet", getBreaker: () => open },
    ),
  ).rejects.toBeInstanceOf(AiDegradedError);
  expect(called).toBe(false);
});
