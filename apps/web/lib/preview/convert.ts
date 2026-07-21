import "server-only";

import type { Json } from "@supertrainer/db/types";

import { buildClientMagicLinkUrl, provisionClientAuthAccount } from "@/lib/auth/provision-client";
import { getOrgThemeBySlug } from "@/lib/brand/theme";
import { createServiceClient } from "@/lib/supabase/server";
import { trackServer } from "@/lib/analytics/server";

export interface ConvertResult {
  redirectTo: string;
}

// Teaser conversion (Phase 2.2): a lead picks a tier → we create their auth
// account + client-role profile + client row (status='onboarding',
// source='teaser', linked to the lead) and hand off a one-time magic link that
// logs them into /portal. Payment is deferred to Phase 8; until then the trainer
// manually approves. Service-role throughout, with org tenancy verified in code.
//
// The auth account is created FIRST: the email's uniqueness in auth.users is the
// concurrency guard, so two concurrent converts for one lead can't both create a
// client (the loser gets email-taken and is sent to sign in). A leadId is NOT a
// standing credential — once converted, this endpoint sends the visitor to
// /login rather than re-minting a session, so a leaked preview URL can't be
// replayed into that client's account.
export async function convertLead(
  slug: string,
  leadId: string,
  tierId: string | null,
): Promise<ConvertResult> {
  const theme = await getOrgThemeBySlug(slug);
  if (!theme) return { redirectTo: "/login?error=This%20link%20is%20no%20longer%20active" };

  const service = createServiceClient();

  const { data: lead } = await service
    .from("leads")
    .select("id, org_id, email, answers, allergens, converted_client_id, status")
    .eq("id", leadId)
    .maybeSingle();
  // Tenancy: the lead must belong to the slug's org.
  if (!lead || lead.org_id !== theme.orgId) {
    return { redirectTo: "/login?error=This%20link%20is%20no%20longer%20active" };
  }

  const email = String((lead.answers as { email?: string })?.email ?? lead.email ?? "").trim();
  if (!email) return { redirectTo: "/login?error=We%20need%20an%20email%20to%20continue" };

  // Already converted → sign in (the account exists; the leadId is not a login).
  if (lead.converted_client_id) return { redirectTo: "/login" };

  // Validate the tier belongs to this org (best-effort — store the choice).
  let selectedTierId: string | null = null;
  if (tierId) {
    const { data: tier } = await service
      .from("tiers")
      .select("id")
      .eq("id", tierId)
      .eq("org_id", theme.orgId)
      .maybeSingle();
    selectedTierId = tier?.id ?? null;
  }

  // Account first — the email uniqueness constraint is the concurrency guard.
  const provisioned = await provisionClientAuthAccount(service, theme.orgId, email);
  if (!provisioned.ok) {
    if (provisioned.step === "create_user") {
      // Email already registered: either a prior conversion, or a concurrent
      // request won the race. Don't create a duplicate client or clobber the
      // lead — just send them to sign in.
      return { redirectTo: "/login" };
    }
    return { redirectTo: "/login?error=Could%20not%20start%20your%20onboarding" };
  }
  const userId = provisioned.userId;

  const intake = {
    ...(lead.answers as Record<string, unknown>),
    email,
    selected_tier_id: selectedTierId,
  };

  const { data: client, error: clientError } = await service
    .from("clients")
    .insert({
      org_id: theme.orgId,
      profile_id: userId,
      status: "onboarding",
      source: "teaser",
      intake: intake as Json,
      // `allergies` key matches the Phase 1 import/demo convention so a single
      // reader (P3/P4) can retrieve allergens across every client population.
      health_flags: { allergies: lead.allergens ?? [] } as Json,
    })
    .select("id")
    .single();
  if (clientError || !client) {
    // Roll back the orphaned auth user so a retry is clean.
    await service.auth.admin.deleteUser(userId);
    return { redirectTo: "/login?error=Could%20not%20start%20your%20onboarding" };
  }

  await service
    .from("leads")
    .update({ status: "converted", converted_client_id: client.id })
    .eq("id", lead.id);

  await trackServer({
    orgId: theme.orgId,
    event: "lead_converted",
    clientId: client.id,
    properties: { lead_id: lead.id, tier_id: selectedTierId },
  });

  const magicLinkUrl = await buildClientMagicLinkUrl(service, email);
  return { redirectTo: magicLinkUrl ?? "/login" };
}
