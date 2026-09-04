"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@supertrainer/db/queries";

import { normalizeDomain } from "@/lib/domains/normalize";
import {
  addDomain,
  domainState,
  isDomainsConfigured,
  removeDomain,
} from "@/lib/domains/vercel";
import { getSessionClaims } from "@/lib/onboarding/state";
import { createServiceClient } from "@/lib/supabase/server";

// Phase 9.5 — connecting a coach's own domain. Every action re-checks the staff
// role, and the host API is only ever called with a platform token from the
// server — a trainer never holds credentials that could touch our project.

export interface DomainResult {
  ok: boolean;
  message?: string;
}

async function staffOrg(): Promise<string | null> {
  const { orgId, role } = await getSessionClaims();
  if (!orgId || (role !== "owner" && role !== "staff")) return null;
  return orgId;
}

export async function connectDomain(input: string): Promise<DomainResult> {
  const orgId = await staffOrg();
  if (!orgId) return { ok: false, message: "Only trainers can connect a domain." };

  const check = normalizeDomain(input);
  if (!check.ok || !check.domain) return { ok: false, message: check.reason };
  const domain = check.domain;

  const service = createServiceClient();
  const { data: taken } = await service
    .from("custom_domains")
    .select("org_id")
    .eq("domain", domain)
    .maybeSingle();
  // Tenancy verified in code — the service role bypasses RLS.
  if (taken && taken.org_id !== orgId) {
    return { ok: false, message: "That domain is already connected to another workspace." };
  }

  if (!isDomainsConfigured()) {
    return {
      ok: false,
      message: "Custom domains aren’t switched on for this workspace yet.",
    };
  }

  const state = await addDomain(domain);
  if (state.error) return { ok: false, message: state.error };

  const { error } = await service.from("custom_domains").upsert(
    {
      org_id: orgId,
      domain,
      status: state.verified ? "active" : "verifying",
      verification: state.records as never,
      verified_at: state.verified ? new Date().toISOString() : null,
      last_checked_at: new Date().toISOString(),
      error: null,
    },
    { onConflict: "org_id" },
  );
  if (error) return { ok: false, message: "Couldn’t save that domain." };

  await recordAudit(service, {
    orgId,
    action: "domain.connected",
    entityType: "custom_domain",
    entityId: domain,
    payload: { verified: state.verified },
  });
  revalidatePath("/trainer/settings/domain");
  return { ok: true };
}

/** Re-read the host's verification state after the coach edits their DNS. */
export async function refreshDomain(): Promise<DomainResult> {
  const orgId = await staffOrg();
  if (!orgId) return { ok: false, message: "Only trainers can do this." };

  const service = createServiceClient();
  const { data: row } = await service
    .from("custom_domains")
    .select("domain")
    .eq("org_id", orgId)
    .maybeSingle();
  if (!row) return { ok: false, message: "No domain connected yet." };

  const state = await domainState(row.domain);
  if (!state.configured) {
    return { ok: false, message: "Custom domains aren’t switched on for this workspace yet." };
  }

  await service
    .from("custom_domains")
    .update({
      status: state.error ? "error" : state.verified ? "active" : "verifying",
      verification: state.records as never,
      verified_at: state.verified ? new Date().toISOString() : null,
      last_checked_at: new Date().toISOString(),
      error: state.error ?? null,
    })
    .eq("org_id", orgId);

  revalidatePath("/trainer/settings/domain");
  return {
    ok: !state.error,
    message: state.error ?? (state.verified ? "Your domain is live." : "DNS hasn’t propagated yet."),
  };
}

export async function disconnectDomain(): Promise<DomainResult> {
  const orgId = await staffOrg();
  if (!orgId) return { ok: false, message: "Only trainers can do this." };

  const service = createServiceClient();
  const { data: row } = await service
    .from("custom_domains")
    .select("domain")
    .eq("org_id", orgId)
    .maybeSingle();
  if (!row) return { ok: true };

  if (isDomainsConfigured()) await removeDomain(row.domain);
  await service.from("custom_domains").delete().eq("org_id", orgId);

  await recordAudit(service, {
    orgId,
    action: "domain.disconnected",
    entityType: "custom_domain",
    entityId: row.domain,
    payload: {},
  });
  revalidatePath("/trainer/settings/domain");
  return { ok: true };
}
