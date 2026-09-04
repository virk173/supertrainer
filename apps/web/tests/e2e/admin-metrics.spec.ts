import { expect, test } from "@playwright/test";

import { costMicros, formatMicros, priceFor } from "@supertrainer/ai/pricing";

import { bucketFor, resolveFlag } from "@/lib/admin/flags-core";
import {
  budgetState,
  churnRate,
  DEFAULT_AI_BUDGET_MICROS,
  funnel,
  INFRA_MICROS_PER_ORG,
  orgHealth,
  platformSummary,
  type OrgHealthInput,
} from "@/lib/admin/metrics-core";

// Phase 9.3 — the console's arithmetic. Every number an operator makes a
// decision from is computed here, so it is tested here.

const base: OrgHealthInput = {
  orgId: "org-1",
  name: "Acme",
  createdAt: "2026-01-01T00:00:00Z",
  clientCount: 10,
  clientMrrCents: 100_000,
  platformMrrCents: 9900,
  aiSpendMicros: 5_000_000,
  aiBudgetMicros: null,
  aiThrottledAt: null,
  draftsApproved: 8,
  draftsEdited: 2,
  pushSent: 90,
  pushFailed: 10,
  lastActiveAt: "2026-09-01T00:00:00Z",
};

test.describe("AI pricing", () => {
  test("prices each model family from its published rate", () => {
    // 1M input tokens of Haiku at $1/MTok = $1 = 1,000,000 micros.
    expect(costMicros("claude-haiku-4-5", 1_000_000, 0)).toBe(1_000_000);
    // 1M output tokens of Sonnet at $15/MTok.
    expect(costMicros("claude-sonnet-5", 0, 1_000_000)).toBe(15_000_000);
    // A dated id still matches its family by prefix.
    expect(costMicros("claude-haiku-4-5-20251001", 1_000_000, 0)).toBe(1_000_000);
  });

  test("an unknown model is priced HIGH, never free", () => {
    const unknown = costMicros("some-future-model", 1_000_000, 0);
    expect(unknown).toBeGreaterThan(0);
    expect(unknown).toBe(priceFor("claude-opus-4-8").inputPerMTok * 1_000_000);
  });

  test("sub-cent spend still reads as a number", () => {
    expect(formatMicros(0)).toBe("$0.00");
    expect(formatMicros(1_500)).toBe("$0.0015");
    expect(formatMicros(2_500_000)).toBe("$2.50");
  });
});

test.describe("budget state", () => {
  test("crosses to near at 80% and over at the cap", () => {
    expect(budgetState(1_000_000, 10_000_000)).toBe("ok");
    expect(budgetState(8_000_000, 10_000_000)).toBe("near");
    expect(budgetState(10_000_000, 10_000_000)).toBe("over");
    expect(budgetState(99_000_000, 10_000_000)).toBe("over");
  });

  test("a null budget falls back to the platform default", () => {
    expect(budgetState(DEFAULT_AI_BUDGET_MICROS - 1, null)).toBe("near");
    expect(budgetState(DEFAULT_AI_BUDGET_MICROS, null)).toBe("over");
  });
});

test.describe("org health", () => {
  test("zero-edit rate is null (not zero) before anything is actioned", () => {
    const fresh = orgHealth({ ...base, draftsApproved: 0, draftsEdited: 0 });
    expect(fresh.zeroEditRate).toBeNull();
    expect(orgHealth(base).zeroEditRate).toBeCloseTo(0.8);
  });

  test("push success is null before anything was attempted", () => {
    expect(orgHealth({ ...base, pushSent: 0, pushFailed: 0 }).pushSuccessRate).toBeNull();
    expect(orgHealth(base).pushSuccessRate).toBeCloseTo(0.9);
  });

  test("margin is revenue minus AI minus the infra allowance, and can go negative", () => {
    const h = orgHealth(base);
    // $99 revenue = 99,000,000 micros; − $5 AI − $2 infra
    expect(h.marginMicros).toBe(99_000_000 - 5_000_000 - INFRA_MICROS_PER_ORG);

    const bleeding = orgHealth({ ...base, platformMrrCents: 0, aiSpendMicros: 40_000_000 });
    expect(bleeding.marginMicros).toBeLessThan(0);
  });
});

test("platform summary adds up, and counts the orgs that cost us money", () => {
  const rows = [
    orgHealth(base),
    orgHealth({ ...base, orgId: "org-2", name: "Beta", platformMrrCents: 0, aiSpendMicros: 40_000_000 }),
  ];
  const s = platformSummary(rows);
  expect(s.orgs).toBe(2);
  expect(s.payingOrgs).toBe(1);
  expect(s.mrrCents).toBe(9900);
  expect(s.arrCents).toBe(9900 * 12);
  expect(s.clients).toBe(20);
  expect(s.unprofitableOrgs).toBe(1);
  expect(s.overBudgetOrgs).toBe(1);
});

test("a funnel measures every step against the top, and shows a broken query as-is", () => {
  const steps = funnel([
    { key: "a", label: "Signed up", count: 100 },
    { key: "b", label: "Branded", count: 60 },
    { key: "c", label: "Paid", count: 15 },
  ]);
  expect(steps.map((s) => Math.round(s.ofTop * 100))).toEqual([100, 60, 15]);

  // A rising step is NOT smoothed — a funnel that grows means the query is wrong,
  // and hiding that would hide the bug.
  const broken = funnel([
    { key: "a", label: "Top", count: 10 },
    { key: "b", label: "More than top", count: 12 },
  ]);
  expect(broken[1].ofTop).toBeGreaterThan(1);

  expect(funnel([]).length).toBe(0);
  expect(funnel([{ key: "a", label: "None", count: 0 }])[0].ofTop).toBe(0);
});

test("churn is null for an empty cohort rather than a fake 0%", () => {
  expect(churnRate({ cohort: "2026-01", started: 0, retained: 0 })).toBeNull();
  expect(churnRate({ cohort: "2026-02", started: 10, retained: 7 })).toBeCloseTo(0.3);
});

test.describe("feature flags", () => {
  const flag = { key: "wearables", enabledDefault: false, rolloutPercent: 50 };

  test("an override always wins, in both directions", () => {
    expect(resolveFlag("org-1", flag, true)).toBe(true);
    expect(resolveFlag("org-1", { ...flag, rolloutPercent: 100 }, false)).toBe(false);
  });

  test("an unknown flag is off — never fail open", () => {
    expect(resolveFlag("org-1", null, null)).toBe(false);
  });

  test("the ramp is deterministic: an org never flickers", () => {
    const first = resolveFlag("org-abc", flag, null);
    for (let i = 0; i < 20; i += 1) expect(resolveFlag("org-abc", flag, null)).toBe(first);
    expect(bucketFor("org-abc", "wearables")).toBe(bucketFor("org-abc", "wearables"));
    // and the same org sits in different buckets for different flags
    expect(bucketFor("org-abc", "wearables")).not.toBe(bucketFor("org-abc", "referrals"));
  });

  test("a 50% ramp actually splits the population roughly in half", () => {
    const ids = Array.from({ length: 400 }, (_, i) => `org-${i}`);
    const on = ids.filter((id) => resolveFlag(id, flag, null)).length;
    expect(on).toBeGreaterThan(140);
    expect(on).toBeLessThan(260);
  });

  test("0% is off unless the default says otherwise; 100% is on for everyone", () => {
    expect(resolveFlag("org-1", { ...flag, rolloutPercent: 0 }, null)).toBe(false);
    expect(
      resolveFlag("org-1", { ...flag, rolloutPercent: 0, enabledDefault: true }, null),
    ).toBe(true);
    expect(resolveFlag("org-1", { ...flag, rolloutPercent: 100 }, null)).toBe(true);
  });
});
