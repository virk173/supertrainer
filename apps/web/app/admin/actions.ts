"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";

import { recordAudit } from "@supertrainer/db/queries";

import {
  adminIdentity,
  closeElevation,
  ELEVATION_COOKIE,
  ELEVATION_MINUTES,
  openElevation,
} from "@/lib/admin/guard";
import { invalidateFlagCache } from "@/lib/admin/flags";
import { invalidateIncidentCache } from "@/lib/admin/incidents";
import {
  authenticationOptions,
  registrationOptions,
  rpID,
  verifyAssertion,
  verifyRegistration,
} from "@/lib/admin/webauthn";
import { runExportJob } from "@/lib/data/export";
import { processStripeEvent } from "@/lib/payments/process-event";
import { createServiceClient } from "@/lib/supabase/server";

// Phase 9.3 — every action in the platform console.
//
// Two guards, always in this order: (1) are you a listed platform admin, and
// (2) do you hold a live hardware-key elevation. Nothing below runs on the first
// alone. Every act is written to platform_audit (platform-wide) or the org's own
// audit_log (org-scoped) — a trainer is entitled to see what we did to their
// workspace.

export interface AdminResult {
  ok: boolean;
  message?: string;
  data?: unknown;
}

async function requireAdmin(): Promise<{ profileId: string } | null> {
  const id = await adminIdentity();
  return id ? { profileId: id.profileId } : null;
}

async function requireElevated(): Promise<{ profileId: string } | null> {
  const id = await adminIdentity();
  return id?.elevated ? { profileId: id.profileId } : null;
}

async function platformAudit(
  actorProfileId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const service = createServiceClient();
  await service.from("platform_audit").insert({
    actor_profile_id: actorProfileId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    payload: payload as never,
  });
}

// ── unlocking the console ────────────────────────────────────────────────────

export async function beginUnlock(): Promise<AdminResult> {
  const who = await requireAdmin();
  if (!who) return { ok: false, message: "Not available." };
  const options = await authenticationOptions(who.profileId);
  return { ok: true, data: options };
}

export async function finishUnlock(response: AuthenticationResponseJSON): Promise<AdminResult> {
  const who = await requireAdmin();
  if (!who) return { ok: false, message: "Not available." };

  const result = await verifyAssertion(who.profileId, response);
  if (!result.ok) {
    await platformAudit(who.profileId, "console.unlock_failed", "admin_session", null, {
      reason: result.reason ?? "unknown",
    });
    return { ok: false, message: "That key wasn’t accepted." };
  }

  const elevationId = await openElevation(who.profileId, result.credentialRowId ?? null);
  const jar = await cookies();
  jar.set(ELEVATION_COOKIE, elevationId, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: ELEVATION_MINUTES * 60,
  });
  await platformAudit(who.profileId, "console.unlocked", "admin_session", elevationId);
  revalidatePath("/admin");
  return { ok: true };
}

export async function beginRegisterKey(label: string): Promise<AdminResult> {
  const who = await requireAdmin();
  if (!who) return { ok: false, message: "Not available." };
  // Registering the FIRST key needs no elevation (there is nothing to elevate
  // with yet); every key after that does.
  const service = createServiceClient();
  // "First key" means first key FOR THIS HOSTNAME. On a new domain there is
  // nothing to elevate with, exactly as on a fresh deployment.
  const { count } = await service
    .from("admin_credentials")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", who.profileId)
    .eq("rp_id", rpID());
  if ((count ?? 0) > 0 && !(await requireElevated())) {
    return { ok: false, message: "Unlock the console before adding another key." };
  }
  const options = await registrationOptions(who.profileId, label);
  return { ok: true, data: options };
}

export async function finishRegisterKey(
  response: RegistrationResponseJSON,
  nickname: string,
): Promise<AdminResult> {
  const who = await requireAdmin();
  if (!who) return { ok: false, message: "Not available." };

  // The elevation rule is re-checked HERE as well as in beginRegisterKey.
  // Without a matching challenge this call already fails, so the check is
  // defence in depth — but "the other function checked" is exactly the
  // assumption that turns a refactor into a second way in.
  const service = createServiceClient();
  const { count } = await service
    .from("admin_credentials")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", who.profileId)
    .eq("rp_id", rpID());
  if ((count ?? 0) > 0 && !(await requireElevated())) {
    return { ok: false, message: "Unlock the console before adding another key." };
  }

  const ok = await verifyRegistration(who.profileId, response, nickname.slice(0, 60) || "Security key");
  if (!ok) return { ok: false, message: "That key couldn’t be registered." };
  await platformAudit(who.profileId, "console.key_registered", "admin_credential", null, { nickname });
  revalidatePath("/admin");
  return { ok: true };
}

export async function lockConsole(): Promise<AdminResult> {
  const jar = await cookies();
  const id = jar.get(ELEVATION_COOKIE)?.value;
  if (id) await closeElevation(id);
  jar.delete(ELEVATION_COOKIE);
  revalidatePath("/admin");
  return { ok: true };
}

// ── AI budget ────────────────────────────────────────────────────────────────

export async function setOrgBudget(orgId: string, dollars: number | null): Promise<AdminResult> {
  const who = await requireElevated();
  if (!who) return { ok: false, message: "Unlock the console first." };
  const micros = dollars === null ? null : Math.max(0, Math.round(dollars * 1_000_000));
  const service = createServiceClient();
  const { error } = await service.from("orgs").update({ ai_budget_micros: micros }).eq("id", orgId);
  if (error) return { ok: false, message: "Couldn’t save that." };
  await platformAudit(who.profileId, "ai_budget.set", "org", orgId, { micros });
  revalidatePath(`/admin/orgs/${orgId}`);
  return { ok: true };
}

export async function setOrgThrottle(orgId: string, on: boolean): Promise<AdminResult> {
  const who = await requireElevated();
  if (!who) return { ok: false, message: "Unlock the console first." };
  const service = createServiceClient();
  const { error } = await service
    .from("orgs")
    .update({ ai_throttled_at: on ? new Date().toISOString() : null })
    .eq("id", orgId);
  if (error) return { ok: false, message: "Couldn’t save that." };
  await recordAudit(service, {
    orgId,
    actorProfileId: who.profileId,
    action: on ? "ai_budget.throttled" : "ai_budget.released",
    entityType: "org",
    entityId: orgId,
    payload: { by: "platform admin" },
  });
  revalidatePath(`/admin/orgs/${orgId}`);
  return { ok: true };
}

// ── feature flags ────────────────────────────────────────────────────────────

export async function upsertFlag(input: {
  key: string;
  description: string;
  enabledDefault: boolean;
  rolloutPercent: number;
}): Promise<AdminResult> {
  const who = await requireElevated();
  if (!who) return { ok: false, message: "Unlock the console first." };
  const key = input.key.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!key) return { ok: false, message: "A flag needs a key." };

  const service = createServiceClient();
  const { error } = await service.from("feature_flags").upsert(
    {
      key,
      description: input.description.slice(0, 200),
      enabled_default: input.enabledDefault,
      rollout_percent: Math.min(100, Math.max(0, Math.round(input.rolloutPercent))),
    },
    { onConflict: "key" },
  );
  if (error) return { ok: false, message: "Couldn’t save that flag." };
  invalidateFlagCache();
  await platformAudit(who.profileId, "flag.upserted", "feature_flag", key, {
    rollout: input.rolloutPercent,
    default: input.enabledDefault,
  });
  revalidatePath("/admin/flags");
  return { ok: true };
}

export async function setFlagOverride(
  flagKey: string,
  orgId: string,
  enabled: boolean | null,
): Promise<AdminResult> {
  const who = await requireElevated();
  if (!who) return { ok: false, message: "Unlock the console first." };
  const service = createServiceClient();
  if (enabled === null) {
    await service
      .from("feature_flag_overrides")
      .delete()
      .eq("flag_key", flagKey)
      .eq("org_id", orgId);
  } else {
    await service
      .from("feature_flag_overrides")
      .upsert({ flag_key: flagKey, org_id: orgId, enabled }, { onConflict: "flag_key,org_id" });
  }
  invalidateFlagCache();
  await platformAudit(who.profileId, "flag.override", "feature_flag", flagKey, { orgId, enabled });
  revalidatePath(`/admin/orgs/${orgId}`);
  return { ok: true };
}

// ── incidents ────────────────────────────────────────────────────────────────

export async function saveIncident(input: {
  id?: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
  surface: "portal" | "dashboard" | "both";
  maintenanceMode: boolean;
  published: boolean;
}): Promise<AdminResult> {
  const who = await requireElevated();
  if (!who) return { ok: false, message: "Unlock the console first." };
  if (!input.title.trim()) return { ok: false, message: "An incident needs a title." };

  const service = createServiceClient();
  const row = {
    title: input.title.slice(0, 120),
    body: input.body.slice(0, 2000),
    severity: input.severity,
    surface: input.surface,
    maintenance_mode: input.maintenanceMode,
    published: input.published,
    created_by: who.profileId,
  };
  const { data, error } = input.id
    ? await service.from("platform_incidents").update(row).eq("id", input.id).select("id").single()
    : await service.from("platform_incidents").insert(row).select("id").single();
  if (error || !data) return { ok: false, message: "Couldn’t save that." };

  invalidateIncidentCache();
  await platformAudit(who.profileId, "incident.saved", "platform_incident", data.id, {
    published: input.published,
    maintenance: input.maintenanceMode,
  });
  revalidatePath("/admin/incidents");
  return { ok: true };
}

export async function endIncident(id: string): Promise<AdminResult> {
  const who = await requireElevated();
  if (!who) return { ok: false, message: "Unlock the console first." };
  const service = createServiceClient();
  await service
    .from("platform_incidents")
    .update({ published: false, maintenance_mode: false, ends_at: new Date().toISOString() })
    .eq("id", id);
  invalidateIncidentCache();
  await platformAudit(who.profileId, "incident.ended", "platform_incident", id);
  revalidatePath("/admin/incidents");
  return { ok: true };
}

// ── support tools ────────────────────────────────────────────────────────────

/** Issue a fresh invite for a client whose link expired or never arrived. */
export async function resendInvite(clientId: string): Promise<AdminResult> {
  const who = await requireElevated();
  if (!who) return { ok: false, message: "Unlock the console first." };

  const service = createServiceClient();
  const { data: client } = await service
    .from("clients")
    .select("id, org_id")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) return { ok: false, message: "No such client." };

  const { data: invite, error } = await service
    .from("invites")
    .insert({ org_id: client.org_id, client_id: client.id })
    .select("token")
    .single();
  if (error || !invite) return { ok: false, message: "Couldn’t issue an invite." };

  await recordAudit(service, {
    orgId: client.org_id,
    actorProfileId: who.profileId,
    action: "invite.reissued",
    entityType: "client",
    entityId: client.id,
    payload: { by: "platform admin" },
  });
  return { ok: true, data: { token: invite.token } };
}

/** Build a fresh archive for an org (a support request, or a failed job). */
export async function regenerateExport(orgId: string): Promise<AdminResult> {
  const who = await requireElevated();
  if (!who) return { ok: false, message: "Unlock the console first." };

  const service = createServiceClient();
  const { data: job, error } = await service
    .from("export_jobs")
    .insert({ org_id: orgId, scope: "org", requested_by: who.profileId })
    .select("id")
    .single();
  if (error || !job) return { ok: false, message: "Couldn’t queue that." };

  try {
    await runExportJob(job.id);
  } catch {
    return { ok: false, message: "The export failed — the nightly worker will retry." };
  }
  await recordAudit(service, {
    orgId,
    actorProfileId: who.profileId,
    action: "data.export_requested",
    entityType: "export_job",
    entityId: job.id,
    payload: { by: "platform admin" },
  });
  revalidatePath(`/admin/orgs/${orgId}`);
  return { ok: true };
}

/** Re-run a stored Stripe event through the SAME path a live delivery takes. */
export async function replayWebhook(webhookEventId: string): Promise<AdminResult> {
  const who = await requireElevated();
  if (!who) return { ok: false, message: "Unlock the console first." };

  const service = createServiceClient();
  const { data: event } = await service
    .from("webhook_events")
    .select("id, stripe_event_id, payload")
    .eq("id", webhookEventId)
    .maybeSingle();
  if (!event) return { ok: false, message: "No such event." };

  try {
    const result = await processStripeEvent(service, event.payload as never);
    if (result.processed) {
      await service
        .from("webhook_events")
        .update({ processed_at: new Date().toISOString() })
        .eq("id", event.id);
    }
    await platformAudit(who.profileId, "webhook.replayed", "webhook_event", event.stripe_event_id, {
      processed: result.processed,
      ignored: result.ignored ?? null,
    });
    revalidatePath("/admin");
    return {
      ok: true,
      message: result.processed ? "Replayed." : `Ignored (${result.ignored}).`,
    };
  } catch (err) {
    console.error("[admin] replay failed", err);
    return { ok: false, message: "The replay failed — it stays unprocessed." };
  }
}

/** Open a READ-ONLY view of an org. Nothing about this grants write access; it
 *  records who looked and why, and the banner says so on every page. */
export async function startOrgView(orgId: string, reason: string): Promise<AdminResult> {
  const who = await requireElevated();
  if (!who) return { ok: false, message: "Unlock the console first." };
  if (reason.trim().length < 5) return { ok: false, message: "Say why you need to look." };

  const service = createServiceClient();
  const { data, error } = await service
    .from("impersonation_sessions")
    .insert({ admin_profile_id: who.profileId, org_id: orgId, reason: reason.slice(0, 200) })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: "Couldn’t open that view." };

  await recordAudit(service, {
    orgId,
    actorProfileId: who.profileId,
    action: "support.view_opened",
    entityType: "org",
    entityId: orgId,
    payload: { reason: reason.slice(0, 200) },
  });
  revalidatePath(`/admin/orgs/${orgId}`);
  return { ok: true, data: { id: data.id } };
}

export async function endOrgView(sessionId: string): Promise<AdminResult> {
  const who = await requireElevated();
  if (!who) return { ok: false, message: "Unlock the console first." };
  const service = createServiceClient();
  const { data } = await service
    .from("impersonation_sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", sessionId)
    .select("org_id")
    .maybeSingle();
  if (data) revalidatePath(`/admin/orgs/${data.org_id}`);
  return { ok: true };
}
