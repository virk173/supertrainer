"use server";

import { revalidatePath } from "next/cache";

import type { Json } from "@supertrainer/db/types";

import { issueInvite } from "@/app/onboarding/invite/actions";
import { trackServer } from "@/lib/analytics/server";
import { getSessionClaims } from "@/lib/onboarding/state";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export interface ConvertProspectResult {
  ok: boolean;
  message?: string;
  joinLink?: string;
}

// PO-1: trainer-initiated "convert manually" on a teaser lead. Reuses the invite
// pipeline rather than the client-initiated preview conversion: it creates a
// client carrying the lead's Stage A answers + allergens (so nothing captured is
// lost), issues a copyable /join invite (the auth account is provisioned when the
// prospect accepts), and marks the lead converted. RLS scopes the lead read to
// the trainer's org; the lead UPDATE goes through the service role (leads grants
// API roles SELECT only) with the org verified in code.
export async function convertProspect(leadId: string): Promise<ConvertProspectResult> {
  const { orgId, role } = await getSessionClaims();
  if (!orgId) return { ok: false, message: "Your session expired — sign in again." };
  if (role !== "owner" && role !== "staff") {
    return { ok: false, message: "Only trainers can convert prospects." };
  }

  const supabase = await createClient();
  // RLS scopes this read to the trainer's own org.
  const { data: lead } = await supabase
    .from("leads")
    .select("id, org_id, email, answers, allergens, converted_client_id")
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
  // account then). `allergies` matches the import/demo/convert convention so a
  // single reader retrieves allergens across every client population. Staff may
  // insert clients under RLS.
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

  // Reuse the invite pipeline (tokenized /join link, rate-limited, branded).
  const invite = await issueInvite({ clientId: client.id, channel: "copy_link" });
  if (!invite.ok || !invite.link) {
    // Roll back the client we just created so a retry is clean (service role —
    // API roles have no DELETE grant on clients).
    await createServiceClient().from("clients").delete().eq("id", client.id);
    return { ok: false, message: invite.message ?? "Couldn't create the invite." };
  }

  // Mark the lead converted + link it. leads has no UPDATE grant for API roles,
  // so this goes through the service role; scope the write to (id, org) in code
  // since the service role bypasses RLS.
  await createServiceClient()
    .from("leads")
    .update({ status: "converted", converted_client_id: client.id })
    .eq("id", leadId)
    .eq("org_id", orgId);

  await trackServer({
    orgId,
    event: "lead_converted",
    clientId: client.id,
    properties: { lead_id: leadId, manual: true },
  });

  revalidatePath("/trainer/prospects");
  return { ok: true, joinLink: invite.link };
}
