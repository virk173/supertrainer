"use server";

import { revalidatePath } from "next/cache";

import type { Json } from "@supertrainer/db/types";

import { trackServer } from "@/lib/analytics/server";
import { getSessionClaims } from "@/lib/onboarding/state";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export interface ConvertProspectResult {
  ok: boolean;
  message?: string;
  joinLink?: string;
}

function appOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

// PO-1: trainer-initiated "convert manually" on a teaser lead. Reuses the invite
// MECHANISM (a tokenized /join link; the auth account is provisioned when the
// prospect accepts) but inlines it rather than calling issueInvite — that action
// carries onboarding-checklist side effects (completeStep/revalidate) and a
// shared daily-invite limit that don't belong to a funnel conversion.
//
// Concurrency: a CAS claim on leads.converted_client_id serializes concurrent
// converts (double-click / two tabs) so one lead can never spawn two clients +
// two invites. RLS scopes the lead read to the trainer's org; the lead writes go
// through the service role (leads grants API roles SELECT only) with the org
// verified in code since the service role bypasses RLS.
export async function convertProspect(leadId: string): Promise<ConvertProspectResult> {
  const { orgId, role } = await getSessionClaims();
  if (!orgId) return { ok: false, message: "Your session expired — sign in again." };
  if (role !== "owner" && role !== "staff") {
    return { ok: false, message: "Only trainers can convert prospects." };
  }

  const supabase = await createClient();
  const service = createServiceClient();

  // RLS scopes this read to the trainer's own org.
  const { data: lead } = await supabase
    .from("leads")
    .select("id, email, answers, allergens, converted_client_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { ok: false, message: "Prospect not found." };
  if (lead.converted_client_id) {
    return { ok: false, message: "This prospect has already been converted." };
  }

  const email = String((lead.answers as { email?: string })?.email ?? lead.email ?? "").trim();
  if (!email) return { ok: false, message: "This prospect has no email to invite." };

  // Create the client from the lead, carrying the teaser answers + allergens.
  // status 'lead' until the invite is accepted (the /join flow provisions the
  // account then). Staff may insert clients under RLS.
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .insert({
      org_id: orgId,
      status: "lead",
      source: "invite",
      intake: { ...(lead.answers as Record<string, unknown>), email } as Json,
      health_flags: { allergies: lead.allergens ?? [] } as Json,
    })
    .select("id")
    .single();
  if (clientError || !client) {
    return { ok: false, message: clientError?.message ?? "Couldn't create the client." };
  }

  // CAS claim: only the first concurrent convert flips converted_client_id from
  // NULL. status is advanced only AFTER the invite is created, so a failure below
  // leaves the lead re-convertible.
  const { data: claimed } = await service
    .from("leads")
    .update({ converted_client_id: client.id })
    .eq("id", leadId)
    .eq("org_id", orgId)
    .is("converted_client_id", null)
    .select("id");
  if (!claimed || claimed.length === 0) {
    // Lost the race — another convert already claimed this lead. Roll back the
    // client we just created (service role — API roles have no DELETE grant).
    await service.from("clients").delete().eq("id", client.id);
    return { ok: false, message: "This prospect has already been converted." };
  }

  // Issue the invite (tokenized /join link). Staff may insert invites under RLS.
  const { data: invite, error: inviteError } = await supabase
    .from("invites")
    .insert({ org_id: orgId, client_id: client.id, channel: "copy_link" })
    .select("token")
    .single();
  if (inviteError || !invite) {
    // Release the claim + delete the client so the prospect is re-convertible.
    await service
      .from("leads")
      .update({ converted_client_id: null })
      .eq("id", leadId)
      .eq("org_id", orgId);
    await service.from("clients").delete().eq("id", client.id);
    return { ok: false, message: inviteError?.message ?? "Couldn't create the invite." };
  }

  // Mark the lead converted now that both the client and invite exist. Error-check
  // it so a silent failure can't leave the lead re-convertible with an orphan.
  const { error: statusError } = await service
    .from("leads")
    .update({ status: "converted" })
    .eq("id", leadId)
    .eq("org_id", orgId);
  if (statusError) {
    console.error("[prospects] failed to mark lead converted (client+invite exist):", statusError);
  }

  await trackServer({
    orgId,
    event: "invite_sent",
    clientId: client.id,
    properties: { channel: "copy_link", source: "prospect_convert" },
  });
  await trackServer({
    orgId,
    event: "lead_converted",
    clientId: client.id,
    properties: { lead_id: leadId, manual: true },
  });

  revalidatePath("/trainer/prospects");
  return { ok: true, joinLink: `${appOrigin()}/join/${invite.token}` };
}
