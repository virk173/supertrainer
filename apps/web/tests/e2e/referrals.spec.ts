import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import {
  creditDecision,
  generateCode,
  MONTHLY_CREDIT_CAP,
  normalizeCode,
  REFERRED_TRIAL_EXTRA_DAYS,
  REFERRER_CREDIT_MONTHS,
  type ReferralFacts,
} from "@/lib/growth/referral-core";

import { expectAxeAAClean, expectNoHorizontalOverflow, settlePaint } from "./axe";
import { consentClient, seedClient, seedTrainer, serviceClient, uniqueEmail } from "./helpers";

// Phase 9.4 — the growth loop. A referral engine that pays on signup pays for
// fraud, so the credit rules are pure, and every abuse guard has a test that
// tries the abuse.

const facts: ReferralFacts = {
  referrerOrgId: "org-a",
  referredOrgId: "org-b",
  referredOnboardingComplete: true,
  referredPayingClients: 1,
  referrerWasReferredBy: [],
  referrerCreditedThisMonth: 0,
};

test.describe("credit rules", () => {
  test("credit lands only once the referred org is genuinely a customer", () => {
    expect(creditDecision(facts)).toEqual({
      decision: "credit",
      referrerMonths: REFERRER_CREDIT_MONTHS,
      referredTrialDays: REFERRED_TRIAL_EXTRA_DAYS,
    });

    const setupIncomplete = creditDecision({ ...facts, referredOnboardingComplete: false });
    expect(setupIncomplete.decision).toBe("wait");
    expect(setupIncomplete.decision === "wait" && setupIncomplete.reason).toContain("setting up");

    const noClients = creditDecision({ ...facts, referredPayingClients: 0 });
    expect(noClients.decision).toBe("wait");
    expect(noClients.decision === "wait" && noClients.reason).toContain("first paying client");
  });

  test("nothing to decide before anyone signs up", () => {
    expect(creditDecision({ ...facts, referredOrgId: null }).decision).toBe("wait");
  });

  test("self-referral is rejected", () => {
    const v = creditDecision({ ...facts, referredOrgId: "org-a" });
    expect(v.decision).toBe("reject");
    expect(v.decision === "reject" && v.reason).toContain("refer yourself");
  });

  test("a circular pair is rejected — A referring B who referred A", () => {
    const v = creditDecision({ ...facts, referrerWasReferredBy: ["org-b"] });
    expect(v.decision).toBe("reject");
    expect(v.decision === "reject" && v.reason).toContain("each other");
  });

  test("a farm hits the monthly ceiling", () => {
    expect(creditDecision({ ...facts, referrerCreditedThisMonth: MONTHLY_CREDIT_CAP - 1 }).decision).toBe(
      "credit",
    );
    const capped = creditDecision({ ...facts, referrerCreditedThisMonth: MONTHLY_CREDIT_CAP });
    expect(capped.decision).toBe("reject");
  });

  test("abuse guards fire BEFORE the eligibility checks", () => {
    // A self-referral that also hasn't activated must read as rejected, not
    // "wait" — otherwise the status page tells a cheat to keep going.
    const v = creditDecision({
      ...facts,
      referredOrgId: "org-a",
      referredOnboardingComplete: false,
      referredPayingClients: 0,
    });
    expect(v.decision).toBe("reject");
  });
});

test.describe("codes", () => {
  test("a code cannot accidentally spell something, or blur 0/O and 1/I", () => {
    const code = generateCode(() => 0.5, 12);
    expect(code).toHaveLength(12);
    expect(code).not.toMatch(/[AEIOU01]/);
  });

  test("codes are normalised the way a person retypes them", () => {
    expect(normalizeCode(" abcd-1234 ")).toBe("ABCD1234");
    expect(normalizeCode("")).toBe("");
  });

  test("draws are spread across the alphabet", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) seen.add(generateCode());
    expect(seen.size).toBe(200);
  });
});

test("the link attributes a signup, and credit follows only after activation", async ({ request }) => {
  test.skip(!process.env.CRON_SECRET, "CRON_SECRET not set — the settle sweep cannot run");
  const service = serviceClient();

  // A referring coach with a code.
  const referrer = await seedTrainer(uniqueEmail("referrer"));
  const code = `E2E${randomUUID().slice(0, 5).toUpperCase().replace(/[^A-Z0-9]/g, "X")}`;
  await service
    .from("referral_codes")
    .insert({ code, org_id: referrer.orgId, kind: "trainer" });

  // A referred org that signed up through it.
  const { data: referredOrg } = await service
    .from("orgs")
    .insert({ name: "Referred Coach", slug: `ref-${randomUUID().slice(0, 8)}` })
    .select("id")
    .single();
  const referredOrgId = referredOrg!.id as string;
  await service.from("referrals").insert({
    code,
    referrer_org_id: referrer.orgId,
    referred_org_id: referredOrgId,
    kind: "trainer",
    status: "signed_up",
    signed_up_at: new Date().toISOString(),
  });

  const settle = async () => {
    const res = await request.get("/api/cron/platform-ops", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    expect(res.status()).toBe(200);
    return res.json();
  };

  // Nothing yet: they haven't finished setting up.
  await settle();
  const { data: waiting } = await service
    .from("referrals")
    .select("status, reason")
    .eq("referred_org_id", referredOrgId)
    .single();
  expect(waiting?.status).toBe("signed_up");
  expect(waiting?.reason).toContain("setting up");

  // Finish onboarding — still not enough without a paying client.
  const steps = ["brand", "style", "tiers", "import", "demo", "invite", "payments"] as const;
  for (const step of steps) {
    await service
      .from("org_onboarding_state")
      .upsert(
        { org_id: referredOrgId, step, status: "done", completed_at: new Date().toISOString() },
        { onConflict: "org_id,step" },
      );
  }
  await settle();
  const { data: stillWaiting } = await service
    .from("referrals")
    .select("status, reason")
    .eq("referred_org_id", referredOrgId)
    .single();
  expect(stillWaiting?.status).toBe("signed_up");
  expect(stillWaiting?.reason).toContain("first paying client");

  // A real paying client → credited, on both sides.
  const { data: client } = await service
    .from("clients")
    .insert({ org_id: referredOrgId, status: "active", source: "invite" })
    .select("id")
    .single();
  await service
    .from("subscriptions")
    .insert({ org_id: referredOrgId, client_id: client!.id, status: "active" });

  await settle();
  const { data: credited } = await service
    .from("referrals")
    .select("status, referrer_credit_months, credited_at")
    .eq("referred_org_id", referredOrgId)
    .single();
  expect(credited?.status).toBe("credited");
  expect(credited?.referrer_credit_months).toBe(REFERRER_CREDIT_MONTHS);

  const { data: referrerSub } = await service
    .from("platform_subscriptions")
    .select("credit_months_remaining")
    .eq("org_id", referrer.orgId)
    .maybeSingle();
  expect(referrerSub?.credit_months_remaining).toBe(REFERRER_CREDIT_MONTHS);

  const { data: referredSub } = await service
    .from("platform_subscriptions")
    .select("trial_extra_days")
    .eq("org_id", referredOrgId)
    .maybeSingle();
  expect(referredSub?.trial_extra_days).toBe(REFERRED_TRIAL_EXTRA_DAYS);

  // Settling again must NOT pay twice.
  await settle();
  const { data: after } = await service
    .from("platform_subscriptions")
    .select("credit_months_remaining")
    .eq("org_id", referrer.orgId)
    .single();
  expect(after?.credit_months_remaining, "credit is granted exactly once").toBe(
    REFERRER_CREDIT_MONTHS,
  );
});

test("a demo client does not buy a referral credit", async ({ request }) => {
  test.skip(!process.env.CRON_SECRET, "CRON_SECRET not set");
  const service = serviceClient();
  const referrer = await seedTrainer(uniqueEmail("demo-referrer"));
  const code = `DEMO${randomUUID().slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, "X")}`;
  await service.from("referral_codes").insert({ code, org_id: referrer.orgId, kind: "trainer" });

  const { data: org } = await service
    .from("orgs")
    .insert({ name: "Demo-only org", slug: `demo-${randomUUID().slice(0, 8)}` })
    .select("id")
    .single();
  const orgId = org!.id as string;
  for (const step of ["brand", "style", "tiers", "import", "demo", "invite", "payments"] as const) {
    await service
      .from("org_onboarding_state")
      .upsert(
        { org_id: orgId, step, status: "done", completed_at: new Date().toISOString() },
        { onConflict: "org_id,step" },
      );
  }
  const { data: demo } = await service
    .from("clients")
    .insert({ org_id: orgId, status: "active", source: "invite", is_demo: true })
    .select("id")
    .single();
  await service
    .from("subscriptions")
    .insert({ org_id: orgId, client_id: demo!.id, status: "active" });
  await service.from("referrals").insert({
    code,
    referrer_org_id: referrer.orgId,
    referred_org_id: orgId,
    kind: "trainer",
    status: "signed_up",
  });

  const res = await request.get("/api/cron/platform-ops", {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(res.status()).toBe(200);

  const { data: row } = await service
    .from("referrals")
    .select("status, reason")
    .eq("referred_org_id", orgId)
    .single();
  expect(row?.status, "a demo client is not a paying client").toBe("signed_up");
  expect(row?.reason).toContain("first paying client");
});

test("the trainer surface mints a link, and the client card obeys the trainer's switch", async ({
  page,
}) => {
  const service = serviceClient();
  const { orgId, tokenHash } = await seedTrainer(uniqueEmail("ref-ui"));

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/trainer/settings/referrals`);
  await expect(page.getByTestId("referrals")).toBeVisible();
  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
  await expectAxeAAClean(page);

  await page.getByTestId("mint-code").click();
  await expect(page.getByTestId("referral-link")).toBeVisible();
  const link = (await page.getByTestId("referral-link").textContent()) ?? "";
  expect(link).toContain("/r/");

  const { data: code } = await service
    .from("referral_codes")
    .select("code, kind")
    .eq("org_id", orgId)
    .single();
  expect(code?.kind).toBe("trainer");
  expect(link).toContain(code!.code);

  // Following it lands a would-be coach on signup, carrying the attribution.
  const visitor = await page.context().browser()!.newContext({ baseURL: "http://localhost:3000" });
  const visitorPage = await visitor.newPage();
  await visitorPage.goto(`/r/${code!.code}`);
  await expect(visitorPage).toHaveURL(/\/signup/);
  const cookies = await visitor.cookies();
  expect(cookies.find((c) => c.name === "st_ref")?.value).toBe(code!.code);

  // An unknown code is not an error page — the visitor did nothing wrong.
  await visitorPage.goto("/r/NOTACODE");
  await expect(visitorPage).toHaveURL(/localhost:3000\/$/);
  await visitor.close();

  // The client card is OFF until the trainer says otherwise.
  const seeded = await seedClient(uniqueEmail("ref-client"));
  await consentClient(seeded.userId);
  await service.from("clients").update({ org_id: orgId }).eq("profile_id", seeded.userId);
  await service.from("profiles").update({ org_id: orgId }).eq("id", seeded.userId);

  const clientCtx = await page.context().browser()!.newContext({ baseURL: "http://localhost:3000" });
  const clientPage = await clientCtx.newPage();
  await clientPage.goto(`/auth/confirm?token_hash=${seeded.tokenHash}&type=email&next=/portal/me`);
  await expect(clientPage.getByTestId("portal-me")).toBeVisible();
  await expect(clientPage.getByTestId("bring-a-friend")).toHaveCount(0);

  // Trainer turns it on → the card appears, with the client's OWN code.
  await page.getByTestId("client-referrals-toggle").check();
  await expect(page.getByText("On", { exact: true })).toBeVisible();

  await clientPage.reload();
  await expect(clientPage.getByTestId("bring-a-friend")).toBeVisible();
  await settlePaint(clientPage);
  await expectNoHorizontalOverflow(clientPage);
  await expectAxeAAClean(clientPage);

  const { data: clientCode } = await service
    .from("referral_codes")
    .select("code, kind, client_id")
    .eq("org_id", orgId)
    .eq("kind", "client")
    .single();
  expect(clientCode?.client_id).not.toBeNull();
  await expect(clientPage.getByTestId("bring-a-friend")).toContainText(clientCode!.code);
  await clientCtx.close();
});
