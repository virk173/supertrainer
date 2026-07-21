import { expect, test } from "@playwright/test";

import {
  hashIp,
  normalizeEmail,
  rateLimitDecision,
} from "../../lib/onboarding/rate-limit";

// Node-level coverage of the teaser limiter's pure decision logic (no browser,
// no DB) — mirrors turnstile.spec.ts.

test("normalizeEmail collapses case, +tags, and Gmail dots", () => {
  expect(normalizeEmail("  User@Example.com ")).toBe("user@example.com");
  // +tag stripped for all providers.
  expect(normalizeEmail("alice+promo@example.com")).toBe("alice@example.com");
  // Gmail: dots insignificant, googlemail == gmail, +tag stripped.
  expect(normalizeEmail("f.i.r.s.t.last+x@gmail.com")).toBe("firstlast@gmail.com");
  expect(normalizeEmail("First.Last@googlemail.com")).toBe("firstlast@gmail.com");
  // Non-Gmail dots are significant — must be preserved.
  expect(normalizeEmail("first.last@outlook.com")).toBe("first.last@outlook.com");
  // Idempotent.
  expect(normalizeEmail(normalizeEmail("A.B+c@GMAIL.com"))).toBe("ab@gmail.com");
});

test("hashIp is a stable non-reversible key, null when unusable", () => {
  expect(hashIp("1.2.3.4", "secret")).toBe(hashIp("1.2.3.4", "secret"));
  expect(hashIp("1.2.3.4", "secret")).not.toBe(hashIp("1.2.3.5", "secret"));
  // Not the raw IP.
  expect(hashIp("1.2.3.4", "secret")).not.toContain("1.2.3.4");
  // No IP or no secret → skip (null).
  expect(hashIp(null, "secret")).toBeNull();
  expect(hashIp("1.2.3.4", undefined)).toBeNull();
});

test("rateLimitDecision applies email → ip → org precedence", () => {
  const limits = { weeklyEmail: 3, dailyOrg: 50, dailyIp: 5 };
  expect(rateLimitDecision({ emailCount: 0, orgCount: 0, ipCount: 0 }, limits)).toEqual({ ok: true });
  expect(rateLimitDecision({ emailCount: 3, orgCount: 0, ipCount: 0 }, limits)).toEqual({ ok: false, reason: "email" });
  expect(rateLimitDecision({ emailCount: 0, orgCount: 0, ipCount: 5 }, limits)).toEqual({ ok: false, reason: "ip" });
  expect(rateLimitDecision({ emailCount: 0, orgCount: 50, ipCount: 0 }, limits)).toEqual({ ok: false, reason: "org" });
  // ipCount null → the per-IP sublimit is skipped.
  expect(rateLimitDecision({ emailCount: 0, orgCount: 0, ipCount: null }, limits)).toEqual({ ok: true });
});
