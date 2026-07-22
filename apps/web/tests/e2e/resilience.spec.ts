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
  expect(classifyAiError(new Error("schema mismatch"))).toBe("other");
  expect(classifyAiError(new AiDegradedError())).toBe("overload");
});

test("retryable / fallback / api-error predicates", () => {
  expect(isRetryable("overload")).toBe(true);
  expect(isRetryable("credit")).toBe(false);
  expect(isRetryable("other")).toBe(false);
  expect(isFallbackEligible("overload")).toBe(true);
  expect(isFallbackEligible("credit")).toBe(false); // shared balance
  expect(isAiApiError(apiErr(529))).toBe(true);
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
  expect(b.allowRequest()).toBe(true); // one trial allowed

  b.recordSuccess(); // trial succeeds → closed
  expect(b.state()).toBe("closed");
  expect(b.isDegraded()).toBe(false);
});

test("callWithResilience: retries a transient error then succeeds", async () => {
  let calls = 0;
  const result = await callWithResilience(
    async () => {
      calls += 1;
      if (calls < 3) throw apiErr(529);
      return "ok";
    },
    { primaryModel: "sonnet", attempts: 3, baseDelayMs: 0, sleep: noSleep, breaker: new CircuitBreaker() },
  );
  expect(result).toBe("ok");
  expect(calls).toBe(3);
});

test("callWithResilience: falls back to the cheaper model on persistent overload", async () => {
  const seen: string[] = [];
  const result = await callWithResilience(
    async (model) => {
      seen.push(model);
      if (model === "sonnet") throw apiErr(529); // primary always overloaded
      return "haiku-ok";
    },
    { primaryModel: "sonnet", fallbackModel: "haiku", attempts: 2, baseDelayMs: 0, sleep: noSleep, breaker: new CircuitBreaker() },
  );
  expect(result).toBe("haiku-ok");
  expect(seen.filter((m) => m === "sonnet").length).toBe(2); // retried primary
  expect(seen).toContain("haiku");
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
      { primaryModel: "sonnet", fallbackModel: "haiku", attempts: 3, baseDelayMs: 0, sleep: noSleep, breaker },
    ),
  ).rejects.toBeTruthy();
  expect(seen).toEqual(["sonnet"]); // no retry, no fallback (shared balance)
  expect(breaker.isDegraded()).toBe(true);
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
      { primaryModel: "sonnet", fallbackModel: "haiku", attempts: 3, baseDelayMs: 0, sleep: noSleep, breaker },
    ),
  ).rejects.toThrow(/schema/);
  expect(calls).toBe(1); // no retry
  expect(breaker.isDegraded()).toBe(false); // not an API-health failure
});

test("callWithResilience: fails fast while the breaker is open", async () => {
  const breaker = new CircuitBreaker(1, 60_000);
  breaker.recordFailure(); // opens it
  let called = false;
  await expect(
    callWithResilience(
      async () => {
        called = true;
        return "should-not-run";
      },
      { primaryModel: "sonnet", breaker },
    ),
  ).rejects.toBeInstanceOf(AiDegradedError);
  expect(called).toBe(false);
});
