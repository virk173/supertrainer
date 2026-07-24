import { expect, test } from "@playwright/test";

import { creditsRemaining, periodMonth } from "@/lib/payments/credits-math";
import { buildFinancialCsv, csvField, type StatementRow } from "@/lib/payments/statements-format";

// Phase 8.5 — financial export + credit math, both coded (rule 4).

test("csvField RFC-4180 escapes commas, quotes, newlines", () => {
  expect(csvField("plain")).toBe("plain");
  expect(csvField("a,b")).toBe('"a,b"');
  expect(csvField('he said "hi"')).toBe('"he said ""hi"""');
  expect(csvField("line\nbreak")).toBe('"line\nbreak"');
  expect(csvField(null)).toBe("");
});

test("financial CSV: net = gross − platform fee, CRLF rows, header", () => {
  const rows: StatementRow[] = [
    {
      date: "2026-08-03T12:00:00.000Z",
      invoiceId: "in_1",
      amountCents: 10000,
      applicationFeeCents: 250,
      currency: "usd",
      status: "paid",
    },
  ];
  const csv = buildFinancialCsv(rows);
  const lines = csv.split("\r\n");
  expect(lines[0]).toBe("Date,Invoice,Gross,Platform fee,Net,Currency,Status");
  expect(lines[1]).toBe("2026-08-03,in_1,100.00,2.50,97.50,USD,paid");
});

test("credit math never goes negative; period is first-of-month UTC", () => {
  expect(creditsRemaining(4, 1)).toBe(3);
  expect(creditsRemaining(2, 5)).toBe(0);
  expect(periodMonth(new Date("2026-08-15T23:59:00.000Z"))).toBe("2026-08-01");
});
