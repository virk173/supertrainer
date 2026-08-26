import { expect, test } from "@playwright/test";

import { productTaxCode } from "@supertrainer/payments";

// Phase 8 — the product tax code stamped on every tier Product. Managed Payments
// REJECTS a Checkout line item whose product has no tax_code, so this value is
// load-bearing for live checkout, not cosmetic.

test("defaults to the personal-training/fitness code", () => {
  const prev = process.env.STRIPE_PRODUCT_TAX_CODE;
  delete process.env.STRIPE_PRODUCT_TAX_CODE;
  // txcd_50021003 = "Fee for Personal Training/Fitness Classes". Stripe files
  // physical exercise under the 50021xxx fitness family — the generic
  // txcd_20060044 "Training" code explicitly EXCLUDES physical exercise.
  expect(productTaxCode()).toBe("txcd_50021003");
  if (prev !== undefined) process.env.STRIPE_PRODUCT_TAX_CODE = prev;
});

test("an accountant can override it per deployment without a code change", () => {
  const prev = process.env.STRIPE_PRODUCT_TAX_CODE;
  process.env.STRIPE_PRODUCT_TAX_CODE = "txcd_20060045";
  expect(productTaxCode()).toBe("txcd_20060045");
  if (prev === undefined) delete process.env.STRIPE_PRODUCT_TAX_CODE;
  else process.env.STRIPE_PRODUCT_TAX_CODE = prev;
});

test("a blank/whitespace override falls back to the default (never sends an empty code)", () => {
  const prev = process.env.STRIPE_PRODUCT_TAX_CODE;
  process.env.STRIPE_PRODUCT_TAX_CODE = "   ";
  expect(productTaxCode()).toBe("txcd_50021003");
  if (prev === undefined) delete process.env.STRIPE_PRODUCT_TAX_CODE;
  else process.env.STRIPE_PRODUCT_TAX_CODE = prev;
});
