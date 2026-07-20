"use server";

import { headers } from "next/headers";

import type { Json } from "@supertrainer/db/types";

import { trackServer } from "@/lib/analytics/server";
import { getOrgThemeBySlug } from "@/lib/brand/theme";
import { hashIp, normalizeEmail, rateLimitDecision, type RateLimitReason } from "@/lib/onboarding/rate-limit";
import { StageASubmissionSchema, splitSubmission } from "@/lib/onboarding/stage-a";
import { verifyTurnstile } from "@/lib/onboarding/turnstile";
import { createServiceClient } from "@/lib/supabase/server";

// Sliding-window teaser quotas (P2.1 + P2 backstop). Weekly-per-email caps a
// single prospect (on a normalized key so +tag/dot variants can't dodge it);
// per-IP/day is a DoS sublimit so one source can't eat the org's quota;
// per-org/day is the overall cost ceiling. All slide on leads.created_at.
const WEEKLY_EMAIL_LIMIT = 3;
const DAILY_ORG_LIMIT = 50;
const PER_IP_DAILY_LIMIT = 5;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const LIMIT_MESSAGES: Record<RateLimitReason, string> = {
  email: "You've already started a few previews this week — check your email or come back later.",
  ip: "There've been a lot of sign-ups from your connection today — please try again tomorrow.",
  org: "This coach is getting a lot of interest today — please try again tomorrow.",
};

export interface SubmitLeadResult {
  ok: boolean;
  leadId?: string;
  message?: string;
  /** Field-scoped error so the form can jump back to the offending step. */
  field?: string;
}

// Persists a Stage A teaser lead for {slug}. Public endpoint: bot-gated by
// Turnstile, rate-limited, and written through the service role (the leads
// table grants API roles no INSERT). Fires 'lead_created' on success.
export async function submitLead(
  slug: string,
  raw: unknown,
  turnstileToken?: string,
): Promise<SubmitLeadResult> {
  const theme = await getOrgThemeBySlug(slug);
  if (!theme) return { ok: false, message: "This coaching link is no longer active." };

  // Bot gate BEFORE any persistence/AI. Best-effort client IP for Turnstile.
  const hdrs = await headers();
  // Trusted client IP for Turnstile + the per-IP DoS sublimit. Prefer Vercel's
  // single-value x-real-ip (set at the edge, not client-overridable); the leftmost
  // X-Forwarded-For entry is client-supplied and spoofable, so fall back to its
  // RIGHTMOST hop (closest trusted proxy), never the leftmost.
  const ip =
    hdrs.get("x-real-ip")?.trim() ||
    hdrs.get("x-forwarded-for")?.split(",").pop()?.trim() ||
    null;
  const turnstile = await verifyTurnstile(turnstileToken, ip);
  if (!turnstile.ok) {
    return { ok: false, message: "Verification failed — please try again." };
  }

  // Never trust the client: re-validate the whole payload server-side.
  const parsed = StageASubmissionSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      message: issue?.message ?? "Please check your answers.",
      field: issue?.path[0] ? String(issue.path[0]) : undefined,
    };
  }

  const { email, phone, allergens, answers } = splitSubmission(parsed.data);
  const service = createServiceClient();

  // Sliding-window rate limits (Postgres counts on created_at).
  const emailNormalized = normalizeEmail(email);
  const ipHash = hashIp(ip, process.env.LEAD_IP_HASH_SECRET);
  const weekAgo = new Date(Date.now() - WEEK_MS).toISOString();
  const dayAgo = new Date(Date.now() - DAY_MS).toISOString();

  const { count: emailCount } = await service
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("org_id", theme.orgId)
    .eq("email_normalized", emailNormalized)
    .gte("created_at", weekAgo);

  const { count: orgCount } = await service
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("org_id", theme.orgId)
    .gte("created_at", dayAgo);

  let ipCount: number | null = null;
  if (ipHash) {
    const { count } = await service
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("org_id", theme.orgId)
      .eq("ip_hash", ipHash)
      .gte("created_at", dayAgo);
    ipCount = count ?? 0;
  }

  const decision = rateLimitDecision(
    { emailCount: emailCount ?? 0, orgCount: orgCount ?? 0, ipCount },
    { weeklyEmail: WEEKLY_EMAIL_LIMIT, dailyOrg: DAILY_ORG_LIMIT, dailyIp: PER_IP_DAILY_LIMIT },
  );
  if (!decision.ok && decision.reason) {
    return { ok: false, message: LIMIT_MESSAGES[decision.reason] };
  }

  const { data: lead, error } = await service
    .from("leads")
    .insert({
      org_id: theme.orgId,
      email,
      email_normalized: emailNormalized,
      ip_hash: ipHash,
      phone,
      allergens,
      answers: answers as Json,
      status: "started",
      turnstile_verified: turnstile.configured && turnstile.ok,
    })
    .select("id")
    .single();
  if (error || !lead) {
    return { ok: false, message: error?.message ?? "Something went wrong — please try again." };
  }

  await trackServer({
    orgId: theme.orgId,
    event: "lead_created",
    properties: { lead_id: lead.id, has_allergens: allergens.length > 0 },
  });

  return { ok: true, leadId: lead.id };
}
