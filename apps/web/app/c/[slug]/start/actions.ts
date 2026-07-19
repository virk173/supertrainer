"use server";

import { headers } from "next/headers";

import type { Json } from "@supertrainer/db/types";

import { trackServer } from "@/lib/analytics/server";
import { getOrgThemeBySlug } from "@/lib/brand/theme";
import { StageASubmissionSchema, splitSubmission } from "@/lib/onboarding/stage-a";
import { verifyTurnstile } from "@/lib/onboarding/turnstile";
import { createServiceClient } from "@/lib/supabase/server";

// Sliding-window teaser quotas (P2.1). Per-email/week caps a single prospect
// hammering one link; per-org/day caps a link being scraped. Both slide on
// leads.created_at — no separate counter table.
const WEEKLY_EMAIL_LIMIT = 3;
const DAILY_ORG_LIMIT = 50;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

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
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
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

  // Sliding-window rate limits (Postgres count on created_at).
  const weekAgo = new Date(Date.now() - WEEK_MS).toISOString();
  const dayAgo = new Date(Date.now() - DAY_MS).toISOString();

  const { count: emailCount } = await service
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("org_id", theme.orgId)
    .eq("email", email)
    .gte("created_at", weekAgo);
  if ((emailCount ?? 0) >= WEEKLY_EMAIL_LIMIT) {
    return {
      ok: false,
      message: "You've already started a few previews this week — check your email or come back later.",
    };
  }

  const { count: orgCount } = await service
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("org_id", theme.orgId)
    .gte("created_at", dayAgo);
  if ((orgCount ?? 0) >= DAILY_ORG_LIMIT) {
    return {
      ok: false,
      message: "This coach is getting a lot of interest today — please try again tomorrow.",
    };
  }

  const { data: lead, error } = await service
    .from("leads")
    .insert({
      org_id: theme.orgId,
      email,
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
