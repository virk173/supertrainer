import "server-only";

import { buildClientMagicLinkUrl, provisionClientAuthAccount } from "@/lib/auth/provision-client";
import { createServiceClient } from "@/lib/supabase/server";
import { trackServer } from "@/lib/analytics/server";

export type ClaimResult =
  | { ok: true; redirectTo: string }
  | { ok: false; redirectTo: string; reason: string };

// Claims an invite: creates (or reuses) the client's auth account, links a
// client-role profile to the lead's client row, marks the invite used, and
// returns a magic-link confirm URL that logs the client in and hands off to the
// portal (Phase 2 Stage B lands there). Service-role throughout — invites are
// not readable by anon/client roles.
export async function claimInvite(token: string): Promise<ClaimResult> {
  const service = createServiceClient();

  const { data: invite } = await service
    .from("invites")
    .select("id, org_id, client_id, used_at, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (
    !invite ||
    invite.used_at !== null ||
    new Date(invite.expires_at).getTime() <= Date.now()
  ) {
    return { ok: false, redirectTo: "/login?error=Invite%20is%20invalid%20or%20expired", reason: "invalid_or_expired" };
  }

  const { data: client } = await service
    .from("clients")
    .select("id, org_id, profile_id, intake")
    .eq("id", invite.client_id)
    .maybeSingle();
  // The invite's client must belong to the invite's org. Reads here use the
  // service role (RLS-bypassing), so verify tenancy in code: a mismatch means
  // the invite was forged to point at another org's client. Legitimate issuance
  // always links a same-org client, so this never trips in normal flows.
  if (!client || client.org_id !== invite.org_id) {
    return { ok: false, redirectTo: "/login?error=Invite%20is%20invalid%20or%20expired", reason: "no_client" };
  }

  // Already claimed — the client has an account; send them to sign in.
  if (client.profile_id) {
    return { ok: false, redirectTo: "/login", reason: "already_claimed" };
  }

  const email = String((client.intake as { email?: string })?.email ?? "").trim();
  if (!email) {
    return { ok: false, redirectTo: "/login?error=Invite%20is%20invalid%20or%20expired", reason: "no_email" };
  }

  // Create the auth account (email pre-confirmed — the invite link is the
  // verification). An existing account for this email means they should sign in.
  const provisioned = await provisionClientAuthAccount(service, invite.org_id, email);
  if (!provisioned.ok) {
    if (provisioned.step === "create_user") {
      return { ok: false, redirectTo: "/login", reason: "email_taken" };
    }
    return {
      ok: false,
      redirectTo: "/login?error=Invite%20is%20invalid%20or%20expired",
      reason: "profile_failed",
    };
  }
  const userId = provisioned.userId;

  await service
    .from("clients")
    .update({ profile_id: userId, status: "onboarding" })
    .eq("id", client.id);

  await service
    .from("invites")
    .update({ used_at: new Date().toISOString() })
    .eq("id", invite.id);

  await trackServer({
    orgId: invite.org_id,
    event: "invite_accepted",
    clientId: client.id,
    properties: { invite_id: invite.id },
  });

  // Magic-link token logs the new client in via /auth/confirm, then /portal.
  const magicLinkUrl = await buildClientMagicLinkUrl(service, email);
  if (!magicLinkUrl) {
    return { ok: false, redirectTo: "/login", reason: "link_failed" };
  }

  return { ok: true, redirectTo: magicLinkUrl };
}

// Records the first open of an invite (funnel: invite_opened). Best-effort.
export async function recordInviteOpen(
  token: string,
): Promise<{ orgName: string | null; valid: boolean }> {
  const service = createServiceClient();
  const { data: invite } = await service
    .from("invites")
    .select("id, org_id, used_at, expires_at, opened_at, orgs (name)")
    .eq("token", token)
    .maybeSingle();

  if (!invite) return { orgName: null, valid: false };

  const valid =
    invite.used_at === null &&
    new Date(invite.expires_at).getTime() > Date.now();

  if (valid && !invite.opened_at) {
    await service
      .from("invites")
      .update({ opened_at: new Date().toISOString() })
      .eq("id", invite.id);
    await trackServer({
      orgId: invite.org_id,
      event: "invite_opened",
      properties: { invite_id: invite.id },
    });
  }

  return { orgName: invite.orgs?.name ?? null, valid };
}
