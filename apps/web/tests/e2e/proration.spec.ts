import { expect, test } from "@playwright/test";

import {
  changeDirection,
  formatMoney,
  summarizeProration,
} from "@/lib/payments/proration";

// Phase 8.2 — proration DISPLAY is coded + tested: what a client is told they'll
// be charged must equal what Stripe charges. Money is never formatted by a model
// and never trusted from the client.

test("formatMoney respects currency decimals", () => {
  expect(formatMoney(10000, "usd")).toBe("$100.00");
  expect(formatMoney(0, "usd")).toBe("$0.00");
  expect(formatMoney(10000, "jpy")).toBe("¥100"); // zero-decimal currency
});

test("changeDirection classifies up/down/same", () => {
  expect(changeDirection(10000, 15000)).toBe("upgrade");
  expect(changeDirection(15000, 10000)).toBe("downgrade");
  expect(changeDirection(10000, 10000)).toBe("same");
});

test("upgrade → prorated charge today + flips immediately", () => {
  const s = summarizeProration({
    immediateChargeCents: 640,
    nextRenewalCents: 15000,
    nextRenewalDate: "2026-08-15T00:00:00.000Z",
    currency: "usd",
    direction: "upgrade",
  });
  expect(s.appliesImmediately).toBe(true);
  expect(s.chargedTodayLabel).toBe("$6.40");
  expect(s.sentence).toContain("$6.40 today");
  expect(s.sentence).toContain("$150.00");
});

test("downgrade → no charge today, applies at period end", () => {
  const s = summarizeProration({
    immediateChargeCents: -320, // unused-time credit; never shown as a charge
    nextRenewalCents: 8000,
    nextRenewalDate: "2026-08-15T00:00:00.000Z",
    currency: "usd",
    direction: "downgrade",
  });
  expect(s.appliesImmediately).toBe(false);
  expect(s.chargedTodayLabel).toBe("$0.00");
  expect(s.sentence).toContain("end of this cycle");
  expect(s.sentence).toContain("$80.00");
});

test("a negative immediate charge never renders as a today-charge", () => {
  const s = summarizeProration({
    immediateChargeCents: -500,
    nextRenewalCents: 12000,
    nextRenewalDate: null,
    currency: "usd",
    direction: "upgrade",
  });
  expect(s.chargedTodayLabel).toBe("$0.00"); // floored at zero
});
