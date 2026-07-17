import "server-only";

import type { Json } from "@supertrainer/db/types";

import { getOrgThemeBySlug } from "@/lib/brand/theme";
import { createServiceClient } from "@/lib/supabase/server";
import { trackServer } from "@/lib/analytics/server";

export interface ConvertResult {
  redirectTo: string;
}

// Teaser conversion (Phase 2.2): a lead picks a tier → we create their client
// (status='onboarding', source='teaser', linked to the lead), create their auth
// account + client-role profile, and hand off a magic link that logs them into
// /portal. Payment is deferred to Phase 8; until then the trainer manually
// approves (sets status='active', approved_manually=true). Service-role
// throughout, with org tenancy verified in code.
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

  // Already converted → just log them back in.
  if (lead.converted_client_id) return { redirectTo: await magicLink(service, email) };

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

  const intake = {
    ...(lead.answers as Record<string, unknown>),
    email,
    selected_tier_id: selectedTierId,
  };

  const { data: client, error: clientError } = await service
    .from("clients")
    .insert({
      org_id: theme.orgId,
      status: "onboarding",
      source: "teaser",
      intake: intake as Json,
      health_flags: { allergens: lead.allergens ?? [] } as Json,
    })
    .select("id")
    .single();
  if (clientError || !client) {
    return { redirectTo: "/login?error=Could%20not%20start%20your%20onboarding" };
  }

  // Create the auth account (email pre-confirmed — they came through the funnel).
  const { data: created, error: createError } =
    await service.auth.admin.createUser({ email, email_confirm: true });
  if (createError || !created?.user) {
    // Email already registered → send them to sign in; keep the client row so
    // the trainer still sees the lead converted.
    await service
      .from("leads")
      .update({ status: "converted", converted_client_id: client.id })
      .eq("id", lead.id);
    return { redirectTo: "/login" };
  }
  const userId = created.user.id;

  const { error: profileError } = await service
    .from("profiles")
    .insert({ id: userId, org_id: theme.orgId, role: "client" });
  if (profileError) {
    await service.auth.admin.deleteUser(userId);
    await service.from("clients").delete().eq("id", client.id);
    return { redirectTo: "/login?error=Could%20not%20start%20your%20onboarding" };
  }

  await service.from("clients").update({ profile_id: userId }).eq("id", client.id);
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

  return { redirectTo: await magicLink(service, email) };
}

// A magic-link confirm URL that signs the client in and lands them on /portal.
async function magicLink(
  service: ReturnType<typeof createServiceClient>,
  email: string,
): Promise<string> {
  const { data: link, error } = await service.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error || !link?.properties?.hashed_token) return "/login";
  return `/auth/confirm?token_hash=${link.properties.hashed_token}&type=email&next=/portal`;
}
