import "server-only";

import { recordAudit } from "@supertrainer/db/queries";

import { trackServer } from "@/lib/analytics/server";
import { emptyStateMap, isOnboardingComplete, isOnboardingStep } from "@/lib/onboarding/steps";
import { createServiceClient } from "@/lib/supabase/server";

import {
  creditDecision,
  generateCode,
  MONTHLY_CREDIT_CAP,
  normalizeCode,
  type ReferralVerdict,
} from "./referral-core";

// Phase 9.4 — the referral engine's server half. Attribution is recorded in the
// referrals ledger AND the events spine (so it survives a signup flow that
// bounces through email), and credit is decided by the pure rules in
// referral-core from facts we can check.

type Service = ReturnType<typeof createServiceClient>;

export const REFERRAL_COOKIE = "st_ref";
export const REFERRAL_COOKIE_DAYS = 30;

/** The org's own trainer→trainer code, minted on first ask. */
export async function trainerCode(orgId: string): Promise<string> {
  const service = createServiceClient();
  const { data: existing } = await service
    .from("referral_codes")
    .select("code")
    .eq("org_id", orgId)
    .eq("kind", "trainer")
    .maybeSingle();
  if (existing) return existing.code;

  // Retry on the (vanishingly unlikely) collision rather than trusting one draw.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode();
    const { error } = await service
      .from("referral_codes")
      .insert({ code, org_id: orgId, kind: "trainer" });
    if (!error) return code;
  }
  throw new Error("referrals: could not mint a code");
}

/** A client's own "bring a friend" code — only while their trainer allows it. */
export async function clientCode(orgId: string, clientId: string): Promise<string | null> {
  const service = createServiceClient();
  const { data: org } = await service
    .from("orgs")
    .select("client_referrals_enabled")
    .eq("id", orgId)
    .maybeSingle();
  if (!org?.client_referrals_enabled) return null;

  const { data: existing } = await service
    .from("referral_codes")
    .select("code")
    .eq("client_id", clientId)
    .maybeSingle();
  if (existing) return existing.code;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode();
    const { error } = await service
      .from("referral_codes")
      .insert({ code, org_id: orgId, kind: "client", client_id: clientId });
    if (!error) return code;
  }
  return null;
}

export interface ResolvedCode {
  code: string;
  orgId: string;
  kind: "trainer" | "client";
  clientId: string | null;
  orgSlug: string;
  orgName: string;
}

/** Look up a code from a /r/{code} visit. */
export async function resolveCode(raw: string): Promise<ResolvedCode | null> {
  const code = normalizeCode(raw);
  if (!code) return null;
  const service = createServiceClient();
  const { data } = await service
    .from("referral_codes")
    .select("code, org_id, kind, client_id, orgs!inner(slug, name)")
    .eq("code", code)
    .maybeSingle();
  if (!data) return null;
  const org = data.orgs as unknown as { slug: string; name: string };
  return {
    code: data.code,
    orgId: data.org_id,
    kind: data.kind,
    clientId: data.client_id,
    orgSlug: org.slug,
    orgName: org.name,
  };
}

/** A trainer signed up carrying a referral code. Records attribution; credit is
 *  decided later, when they are actually a customer. */
export async function attributeTrainerSignup(
  referredOrgId: string,
  rawCode: string,
): Promise<{ ok: boolean; reason?: string }> {
  const resolved = await resolveCode(rawCode);
  if (!resolved || resolved.kind !== "trainer") return { ok: false, reason: "unknown code" };
  if (resolved.orgId === referredOrgId) return { ok: false, reason: "self-referral" };

  const service = createServiceClient();
  const { error } = await service.from("referrals").insert({
    code: resolved.code,
    referrer_org_id: resolved.orgId,
    referred_org_id: referredOrgId,
    kind: "trainer",
    status: "signed_up",
    signed_up_at: new Date().toISOString(),
  });
  // A unique violation means this org was already attributed — first link wins,
  // and re-attributing later would let a second referrer steal the credit.
  if (error) return { ok: false, reason: "already attributed" };

  await trackServer({
    orgId: resolved.orgId,
    event: "referral_signed_up",
    properties: { code: resolved.code, referred_org_id: referredOrgId },
  });
  return { ok: true };
}

/** A friend followed a client's link and became a lead. */
export async function attributeLead(leadId: string, rawCode: string): Promise<void> {
  const resolved = await resolveCode(rawCode);
  if (!resolved || resolved.kind !== "client") return;

  const service = createServiceClient();
  const { data: lead } = await service
    .from("leads")
    .select("org_id")
    .eq("id", leadId)
    .maybeSingle();
  // A client's link only attributes leads for their OWN coach.
  if (!lead || lead.org_id !== resolved.orgId) return;

  await service.from("referrals").insert({
    code: resolved.code,
    referrer_org_id: resolved.orgId,
    referred_lead_id: leadId,
    kind: "client",
    status: "signed_up",
    signed_up_at: new Date().toISOString(),
  });
  await trackServer({
    orgId: resolved.orgId,
    event: "referral_lead",
    properties: { code: resolved.code, lead_id: leadId },
  });
}

/** Onboarding state read with the SERVICE role.
 *  getOnboardingState() reads through the caller's session, which is exactly
 *  right in a request and exactly wrong in a cron: with no session, RLS returns
 *  nothing and every org looks like it never onboarded — so every referral would
 *  wait forever. This reads the same rows without a session. */
async function onboardingComplete(service: Service, orgId: string): Promise<boolean> {
  const state = emptyStateMap();
  const { data } = await service
    .from("org_onboarding_state")
    .select("step, status")
    .eq("org_id", orgId);
  for (const row of data ?? []) {
    if (isOnboardingStep(row.step)) state[row.step] = row.status;
  }
  return isOnboardingComplete(state);
}

async function factsFor(
  service: Service,
  referrerOrgId: string,
  referredOrgId: string | null,
): Promise<Parameters<typeof creditDecision>[0]> {
  const [onboarding, paying, circular, credited] = await Promise.all([
    referredOrgId ? onboardingComplete(service, referredOrgId) : Promise.resolve(false),
    referredOrgId
      ? service
          .from("subscriptions")
          .select("id, clients!inner(is_demo)", { count: "exact", head: false })
          .eq("org_id", referredOrgId)
          .in("status", ["active", "trialing"])
      : Promise.resolve({ data: [] as { id: string; clients: { is_demo: boolean } }[] }),
    service.from("referrals").select("referrer_org_id").eq("referred_org_id", referrerOrgId),
    service
      .from("referrals")
      .select("id")
      .eq("referrer_org_id", referrerOrgId)
      .eq("status", "credited")
      .gte("credited_at", new Date(Date.now() - 30 * 86_400_000).toISOString()),
  ]);

  const payingRows = (paying.data ?? []) as unknown as { clients?: { is_demo?: boolean } }[];
  return {
    referrerOrgId,
    referredOrgId,
    referredOnboardingComplete: onboarding,
    referredPayingClients: payingRows.filter((r) => !r.clients?.is_demo).length,
    referrerWasReferredBy: (circular.data ?? []).map((r) => r.referrer_org_id),
    referrerCreditedThisMonth: (credited.data ?? []).length,
  };
}

/** Bank the reward on both sides. Platform billing consumes it when it goes
 *  live; recording months we cannot charge against yet is the honest half of a
 *  promise we've already made. */
async function applyCredit(
  service: Service,
  referrerOrgId: string,
  referredOrgId: string,
  months: number,
  trialDays: number,
): Promise<void> {
  const { data: referrerSub } = await service
    .from("platform_subscriptions")
    .select("credit_months_remaining")
    .eq("org_id", referrerOrgId)
    .maybeSingle();
  await service.from("platform_subscriptions").upsert(
    {
      org_id: referrerOrgId,
      credit_months_remaining: (referrerSub?.credit_months_remaining ?? 0) + months,
    },
    { onConflict: "org_id" },
  );

  const { data: referredSub } = await service
    .from("platform_subscriptions")
    .select("trial_extra_days")
    .eq("org_id", referredOrgId)
    .maybeSingle();
  await service.from("platform_subscriptions").upsert(
    {
      org_id: referredOrgId,
      trial_extra_days: (referredSub?.trial_extra_days ?? 0) + trialDays,
    },
    { onConflict: "org_id" },
  );
}

export interface EvaluationResult {
  referralId: string;
  verdict: ReferralVerdict;
}

/** Walk every referral that hasn't settled and decide it. Idempotent: a credited
 *  or rejected referral is never revisited, so credit is granted exactly once. */
export async function evaluateReferrals(): Promise<EvaluationResult[]> {
  const service = createServiceClient();
  const { data: open } = await service
    .from("referrals")
    .select("id, referrer_org_id, referred_org_id, kind, status")
    .in("status", ["pending", "signed_up", "activated"])
    .eq("kind", "trainer");

  const out: EvaluationResult[] = [];
  for (const referral of open ?? []) {
    const facts = await factsFor(service, referral.referrer_org_id, referral.referred_org_id);
    const verdict = creditDecision(facts);
    out.push({ referralId: referral.id, verdict });

    if (verdict.decision === "reject") {
      await service
        .from("referrals")
        .update({ status: "rejected", reason: verdict.reason })
        .eq("id", referral.id);
      continue;
    }
    if (verdict.decision === "wait") {
      // Record the reason so the status page can say what we're waiting for.
      if (referral.status !== "rejected") {
        await service.from("referrals").update({ reason: verdict.reason }).eq("id", referral.id);
      }
      continue;
    }

    await applyCredit(
      service,
      referral.referrer_org_id,
      referral.referred_org_id!,
      verdict.referrerMonths,
      verdict.referredTrialDays,
    );
    await service
      .from("referrals")
      .update({
        status: "credited",
        reason: null,
        referrer_credit_months: verdict.referrerMonths,
        referred_credit_months: 0,
        activated_at: new Date().toISOString(),
        credited_at: new Date().toISOString(),
      })
      .eq("id", referral.id);

    await recordAudit(service, {
      orgId: referral.referrer_org_id,
      action: "referral.credited",
      entityType: "referral",
      entityId: referral.id,
      payload: { months: verdict.referrerMonths, referred_org_id: referral.referred_org_id },
    });
    await trackServer({
      orgId: referral.referrer_org_id,
      event: "referral_credited",
      properties: { months: verdict.referrerMonths },
    });
  }
  return out;
}

export { MONTHLY_CREDIT_CAP };
