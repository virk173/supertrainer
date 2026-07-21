import { expect, test } from "@playwright/test";

import { clientIp } from "../../lib/http/client-ip";

// Node-level coverage of the trusted-hop IP resolver shared by the consent
// evidence path (consent/actions.ts) and the public leads endpoint
// (c/[slug]/start/actions.ts) — mirrors turnstile.spec.ts / rate-limit.spec.ts.
// The point of this helper is that it NEVER trusts the client-suppliable
// leftmost X-Forwarded-For hop; every case below asserts that directly.

test("x-real-ip is preferred over x-forwarded-for", () => {
  const hdrs = new Headers({
    "x-real-ip": "203.0.113.9",
    "x-forwarded-for": "9.9.9.9, 10.0.0.1",
  });
  expect(clientIp(hdrs)).toBe("203.0.113.9");
});

test("falls back to the RIGHTMOST x-forwarded-for hop, never the leftmost", () => {
  const hdrs = new Headers({
    "x-forwarded-for": "9.9.9.9, 198.51.100.20, 10.0.0.1",
  });
  const ip = clientIp(hdrs);
  expect(ip).toBe("10.0.0.1");
  // The attacker-suppliable leftmost hop must never be returned.
  expect(ip).not.toBe("9.9.9.9");
});

test("trims whitespace around the chosen hop", () => {
  const hdrs = new Headers({
    "x-forwarded-for": "9.9.9.9,  198.51.100.20  ",
  });
  expect(clientIp(hdrs)).toBe("198.51.100.20");
});

test("single x-forwarded-for hop (no proxy chain) is used as-is", () => {
  const hdrs = new Headers({ "x-forwarded-for": "198.51.100.20" });
  expect(clientIp(hdrs)).toBe("198.51.100.20");
});

test("null when neither header is present", () => {
  expect(clientIp(new Headers())).toBeNull();
});

test("null when headers are present but empty", () => {
  const hdrs = new Headers({ "x-real-ip": "", "x-forwarded-for": "" });
  expect(clientIp(hdrs)).toBeNull();
});
