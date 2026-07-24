import { expect, test } from "@playwright/test";

import {
  keywordEscalation,
  keywordHealthFlags,
  routeMessage,
  ROUTE_FIXTURES,
  type RoutingClassification,
} from "../../../../packages/ai/src/comms-router";

// Phase 6.3 — the fail-closed intent router, CI-GATED (no live model). The safety
// invariant: 100% escalation recall (zero false negatives) + ≥90% routing
// accuracy, and NEVER routine_autonomous on doubt. The keyword floor is exercised
// deterministically; the classifier is exercised with each fixture's competent-
// model answer (fake), so the ROUTING logic — how the two gates compose — is what
// is under test. The live model's own recall is measured by eval:comms.

const fakeClassify = (out: RoutingClassification) => async () => out;
const throwingClassify = async (): Promise<RoutingClassification> => {
  throw new Error("classifier outage");
};

test("keyword FLOOR alone catches every keyword-detectable escalation (fail-closed)", () => {
  const detectable = ROUTE_FIXTURES.filter((f) => f.expect === "escalation" && f.keywordDetectable);
  for (const f of detectable) {
    const kw = keywordEscalation(f.text);
    expect(kw.categories.length, `floor should catch "${f.text}"`).toBeGreaterThan(0);
  }
  // Sanity: the suite genuinely includes keyword-INVISIBLE escalations (the ones
  // the classifier must catch), or the floor test would be trivially complete.
  const sneaky = ROUTE_FIXTURES.filter((f) => f.expect === "escalation" && !f.keywordDetectable);
  expect(sneaky.length).toBeGreaterThanOrEqual(4);
});

test("100% escalation recall across the 50-case suite (zero false negatives)", async () => {
  const escalations = ROUTE_FIXTURES.filter((f) => f.expect === "escalation");
  for (const f of escalations) {
    const r = await routeMessage(f.text, { classify: fakeClassify(f.classifierWould) });
    expect(r.escalation, `must escalate: "${f.text}"`).toBe(true);
    expect(r.category).toBe("escalation");
  }
});

test("≥90% overall routing accuracy across the 50-case suite", async () => {
  let correct = 0;
  for (const f of ROUTE_FIXTURES) {
    const r = await routeMessage(f.text, { classify: fakeClassify(f.classifierWould) });
    if (r.category === f.expect) correct++;
  }
  expect(ROUTE_FIXTURES.length).toBe(50);
  expect(correct / ROUTE_FIXTURES.length).toBeGreaterThanOrEqual(0.9);
});

test("fail-closed under classifier outage: keyword escalations still fire, misses never go autonomous", async () => {
  // Keyword-detectable escalation with the classifier DOWN → still escalation.
  const kwEsc = ROUTE_FIXTURES.find((f) => f.expect === "escalation" && f.keywordDetectable)!;
  const a = await routeMessage(kwEsc.text, { classify: throwingClassify });
  expect(a.escalation).toBe(true);
  expect(a.source).toBe("keyword");

  // A keyword-INVISIBLE escalation with the classifier down → the floor misses it,
  // but it degrades to conversational (a human sees it), NEVER routine_autonomous.
  const sneaky = ROUTE_FIXTURES.find((f) => f.expect === "escalation" && !f.keywordDetectable)!;
  const b = await routeMessage(sneaky.text, { classify: throwingClassify });
  expect(b.category).not.toBe("routine_autonomous");
  expect(b.category).toBe("conversational");
});

test("the keyword floor is authoritative — a confident classifier cannot clear it", async () => {
  const kwEsc = ROUTE_FIXTURES.find((f) => f.expect === "escalation" && f.keywordDetectable)!;
  const r = await routeMessage(kwEsc.text, {
    // Classifier insists it's a routine lookup, high confidence — must NOT win.
    classify: fakeClassify({ category: "routine_autonomous", confidence: 0.99, selfHarm: false }),
  });
  expect(r.escalation).toBe(true);
  expect(r.category).toBe("escalation");
});

test("below the confidence floor is never autonomous — it drops to conversational", async () => {
  const r = await routeMessage("what's my lunch today?", {
    classify: fakeClassify({ category: "routine_autonomous", confidence: 0.7, selfHarm: false }),
  });
  expect(r.category).toBe("conversational");
  // At/above the floor, the same message IS routed autonomously.
  const r2 = await routeMessage("what's my lunch today?", {
    classify: fakeClassify({ category: "routine_autonomous", confidence: 0.85, selfHarm: false }),
  });
  expect(r2.category).toBe("routine_autonomous");
});

test("self-harm signals set the crisis flag (keyword OR classifier)", async () => {
  for (const f of ROUTE_FIXTURES.filter((f) => f.selfHarm)) {
    const r = await routeMessage(f.text, { classify: fakeClassify(f.classifierWould) });
    expect(r.selfHarm, `selfHarm for "${f.text}"`).toBe(true);
    expect(r.escalation).toBe(true);
  }
});

test("plan-change requests escalate and carry the planChange flag", async () => {
  for (const f of ROUTE_FIXTURES.filter((f) => f.planChange)) {
    const r = await routeMessage(f.text, { classify: fakeClassify(f.classifierWould) });
    expect(r.category).toBe("escalation");
    expect(r.planChange).toBe(true);
  }
});

test("empty text is inert (conversational, never escalation)", async () => {
  const r = await routeMessage("   ");
  expect(r.escalation).toBe(false);
  expect(r.category).toBe("conversational");
});

test("the absorbed health gate still classifies (P2.5 backward-compat)", () => {
  expect(keywordHealthFlags("I'm type 2 diabetic and take metformin").categories).toEqual(
    expect.arrayContaining(["condition", "medication"]),
  );
  expect(keywordHealthFlags("I'm 5 months pregnant").categories).toContain("pregnancy");
  expect(keywordHealthFlags("my ACL is torn, had surgery").categories).toContain("injury");
});
