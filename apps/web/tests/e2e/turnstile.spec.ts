import { expect, test } from "@playwright/test";

import { verifyTurnstile } from "../../lib/onboarding/turnstile";

// Node-level coverage of the bot-gate's decision logic (no browser, no live
// Cloudflare keys). verifyTurnstile only reads an env secret and calls fetch, so
// we drive every branch by toggling the secret and stubbing global fetch.

const realFetch = globalThis.fetch;
const realSecret = process.env.TURNSTILE_SECRET_KEY;

test.afterEach(() => {
  globalThis.fetch = realFetch;
  if (realSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
  else process.env.TURNSTILE_SECRET_KEY = realSecret;
});

test("unconfigured (no secret) → passes but flagged not-configured", async () => {
  delete process.env.TURNSTILE_SECRET_KEY;
  const result = await verifyTurnstile("anything");
  expect(result).toEqual({ ok: true, configured: false });
});

test("configured but no token → rejected", async () => {
  process.env.TURNSTILE_SECRET_KEY = "test-secret";
  const result = await verifyTurnstile(undefined);
  expect(result).toEqual({ ok: false, configured: true });
});

test("configured + Cloudflare says failure → rejected", async () => {
  process.env.TURNSTILE_SECRET_KEY = "test-secret";
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ success: false }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

  const result = await verifyTurnstile("bad-token");
  expect(result).toEqual({ ok: false, configured: true });
});

test("configured + Cloudflare says success → passes", async () => {
  process.env.TURNSTILE_SECRET_KEY = "test-secret";
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

  const result = await verifyTurnstile("good-token");
  expect(result).toEqual({ ok: true, configured: true });
});

test("configured + network error verifying → fails closed", async () => {
  process.env.TURNSTILE_SECRET_KEY = "test-secret";
  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;

  const result = await verifyTurnstile("token");
  expect(result).toEqual({ ok: false, configured: true });
});
