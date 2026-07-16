"use server";

import { revalidatePath } from "next/cache";

import type { BrandConfig } from "@supertrainer/ui/lib/brand";
import type { Json } from "@supertrainer/db/types";

import { completeStep } from "@/app/onboarding/actions";
import { sendInviteEmail } from "@/lib/email/invite";
import { getSessionClaims } from "@/lib/onboarding/state";
import { isValidEmail } from "@/lib/import/fields";
import { trackServer } from "@/lib/analytics/server";
import { createClient } from "@/lib/supabase/server";

const DAILY_LIMIT = 100;

function appOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export interface IssueInviteInput {
  clientId?: string | null;
  email?: string | null;
  personalMessage?: string;
  channel: "copy_link" | "email";
}

export interface IssueInviteResult {
  ok: boolean;
  message?: string;
  link?: string;
  emailSent?: boolean;
  emailReason?: string;
}

// Issues a tokenized invite for an imported lead or a freshly-entered email.
// Never sends automatically for copy_link; for email it sends via Resend
// (no-ops without a key — the link is always returned to copy).
export async function issueInvite(
  input: IssueInviteInput,
): Promise<IssueInviteResult> {
  const { orgId, role } = await getSessionClaims();
  if (!orgId) return { ok: false, message: "Your session expired — sign in again." };
  if (role !== "owner" && role !== "staff") {
    return { ok: false, message: "Only trainers can send invites." };
  }

  const supabase = await createClient();

  // Rate limit: 100 invites / 24h / org.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("invites")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .gte("created_at", since);
  if ((count ?? 0) >= DAILY_LIMIT) {
    return { ok: false, message: `Daily invite limit (${DAILY_LIMIT}) reached — try again tomorrow.` };
  }

  // Resolve the client: an existing lead, or create one from the email.
  let clientId = input.clientId ?? null;
  let recipientEmail = "";

  if (clientId) {
    const { data: client } = await supabase
      .from("clients")
      .select("id, intake")
      .eq("id", clientId)
      .maybeSingle();
    if (!client) return { ok: false, message: "Client not found." };
    recipientEmail = String((client.intake as { email?: string })?.email ?? "");
  } else {
    const email = (input.email ?? "").trim();
    if (!isValidEmail(email)) return { ok: false, message: "Enter a valid email." };
    const { data: created, error } = await supabase
      .from("clients")
      .insert({
        org_id: orgId,
        status: "lead",
        source: "invite",
        intake: { email } as unknown as Json,
      })
      .select("id")
      .single();
    if (error || !created) return { ok: false, message: error?.message ?? "Couldn't create the client." };
    clientId = created.id;
    recipientEmail = email;
  }

  const { data: invite, error: inviteError } = await supabase
    .from("invites")
    .insert({
      org_id: orgId,
      client_id: clientId,
      channel: input.channel,
      personal_message: input.personalMessage?.trim() || null,
    })
    .select("token")
    .single();
  if (inviteError || !invite) {
    return { ok: false, message: inviteError?.message ?? "Couldn't create the invite." };
  }

  const link = `${appOrigin()}/join/${invite.token}`;

  await trackServer({
    orgId,
    event: "invite_sent",
    clientId,
    properties: { channel: input.channel },
  });

  let emailSent: boolean | undefined;
  let emailReason: string | undefined;
  if (input.channel === "email") {
    const { data: org } = await supabase
      .from("orgs")
      .select("name, brand")
      .eq("id", orgId)
      .maybeSingle();
    const brand = (org?.brand ?? {}) as BrandConfig;
    const result = await sendInviteEmail({
      to: recipientEmail,
      trainerName: brand.displayName?.trim() || org?.name || "Your coach",
      joinUrl: link,
      personalMessage: input.personalMessage,
      brand,
    });
    emailSent = result.sent;
    emailReason = result.reason;
  }

  await completeStep("invite");
  revalidatePath("/onboarding/invite");
  revalidatePath("/onboarding");

  return { ok: true, link, emailSent, emailReason };
}
