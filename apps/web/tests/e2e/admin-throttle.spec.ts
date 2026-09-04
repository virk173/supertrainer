import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { enqueueRenewals } from "@/lib/plans/renewals";

import { serviceClient } from "./helpers";

// Phase 9.3 — the budget throttle's actual behaviour, not just its flag.
//
// The promise is narrow and load-bearing: an org over its AI cap stops SCHEDULED
// generation and nothing else. If this test ever passes while a client-facing
// path is also suppressed, we have quietly made a coach look absent to protect a
// margin — the exact failure the design is meant to prevent.

async function seedOrgWithDuePlan(name: string) {
  const service = serviceClient();
  const { data: org } = await service
    .from("orgs")
    .insert({ name, slug: `thr-${randomUUID().slice(0, 8)}` })
    .select("id")
    .single();
  const orgId = org!.id as string;

  const { data: client } = await service
    .from("clients")
    .insert({ org_id: orgId, status: "active", source: "invite", intake: { name } })
    .select("id")
    .single();
  const clientId = client!.id as string;

  // A live plan old enough to be due for its monthly renewal.
  const { data: plan } = await service
    .from("plans")
    .insert({
      org_id: orgId,
      client_id: clientId,
      version: 1,
      status: "approved",
      source: "onboarding",
      approved_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  await service.from("plans_active").insert({
    org_id: orgId,
    client_id: clientId,
    plan_id: plan!.id,
    effective_from: "2026-01-01",
  });

  return { service, orgId, clientId };
}

test("an org over its AI budget stops SCHEDULED generation, and others keep running", async () => {
  const paying = await seedOrgWithDuePlan("Within budget");
  const broke = await seedOrgWithDuePlan("Over budget");
  const service = paying.service;

  const result = await enqueueRenewals(service, new Date(), 28, new Set([broke.orgId]));
  expect(result.skipped ?? 0).toBeGreaterThan(0);

  const { count: queuedForPaying } = await service
    .from("plan_requests")
    .select("id", { count: "exact", head: true })
    .eq("org_id", paying.orgId);
  expect(queuedForPaying, "an org within budget still gets its monthly plan").toBe(1);

  const { count: queuedForBroke } = await service
    .from("plan_requests")
    .select("id", { count: "exact", head: true })
    .eq("org_id", broke.orgId);
  expect(queuedForBroke, "a throttled org's SCHEDULED plan waits for next period").toBe(0);

  // Nothing about the throttle touches the client's own record: they are still
  // active, still visible, and a trainer-initiated plan is unaffected.
  const { data: stillActive } = await service
    .from("clients")
    .select("status")
    .eq("id", broke.clientId)
    .single();
  expect(stillActive?.status).toBe("active");

  const { error } = await service.from("plan_requests").insert({
    org_id: broke.orgId,
    client_id: broke.clientId,
    kind: "diet",
    trigger: "manual",
    status: "queued",
  });
  expect(error, "a trainer can still ask for a plan by hand").toBeNull();
});

test("the sweep throttles on the way up and releases on the way down, auditing both", async ({
  request,
}) => {
  test.skip(!process.env.CRON_SECRET, "CRON_SECRET not set — the sweep cannot run");
  const sweep = async () => {
    const res = await request.get("/api/cron/platform-ops", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    expect(res.status()).toBe(200);
    return res.json();
  };
  const service = serviceClient();
  const { data: org } = await service
    .from("orgs")
    .insert({
      name: "Budget sweep",
      slug: `sweep-${randomUUID().slice(0, 8)}`,
      ai_budget_micros: 1_000_000,
    })
    .select("id")
    .single();
  const orgId = org!.id as string;

  // Under cap → untouched.
  await service.from("ai_usage").insert({
    org_id: orgId,
    model: "claude-haiku-4-5",
    input_tokens: 100_000,
    output_tokens: 0,
    cost_micros: 100_000,
  });
  await sweep();
  const { data: quiet } = await service.from("orgs").select("ai_throttled_at").eq("id", orgId).single();
  expect(quiet?.ai_throttled_at).toBeNull();

  // Over cap → throttled, and the org's own audit log says why.
  await service.from("ai_usage").insert({
    org_id: orgId,
    model: "claude-opus-4-8",
    input_tokens: 2_000_000,
    output_tokens: 0,
    cost_micros: 2_000_000,
  });
  await sweep();
  const { data: throttled } = await service
    .from("orgs")
    .select("ai_throttled_at")
    .eq("id", orgId)
    .single();
  expect(throttled?.ai_throttled_at).not.toBeNull();

  const { data: audit } = await service
    .from("audit_log")
    .select("action, payload")
    .eq("org_id", orgId)
    .eq("action", "ai_budget.throttled");
  expect(audit?.length).toBe(1);

  // Re-running changes nothing for this org — the sweep is idempotent.
  await sweep();
  const { data: auditAgain } = await service
    .from("audit_log")
    .select("action")
    .eq("org_id", orgId)
    .eq("action", "ai_budget.throttled");
  expect(auditAgain?.length, "a second sweep must not re-audit a state that didn't change").toBe(1);

  // Raise the cap → released on the next sweep.
  await service.from("orgs").update({ ai_budget_micros: 100_000_000 }).eq("id", orgId);
  await sweep();
  const { data: released } = await service
    .from("orgs")
    .select("ai_throttled_at")
    .eq("id", orgId)
    .single();
  expect(released?.ai_throttled_at).toBeNull();
  const { data: releaseAudit } = await service
    .from("audit_log")
    .select("action")
    .eq("org_id", orgId)
    .eq("action", "ai_budget.released");
  expect(releaseAudit?.length).toBe(1);
});
