import "server-only";

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
    .select("id, profile_id, intake")
    .eq("id", invite.client_id)
    .maybeSingle();
  if (!client) {
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
  const { data: created, error: createError } =
    await service.auth.admin.createUser({ email, email_confirm: true });
  if (createError || !created?.user) {
    return { ok: false, redirectTo: "/login", reason: "email_taken" };
  }
  const userId = created.user.id;

  const { error: profileError } = await service.from("profiles").insert({
    id: userId,
    org_id: invite.org_id,
    role: "client",
  });
  if (profileError) {
    // Roll back the orphaned auth user so a retry is clean.
    await service.auth.admin.deleteUser(userId);
    return { ok: false, redirectTo: "/login?error=Invite%20is%20invalid%20or%20expired", reason: "profile_failed" };
  }

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
  const { data: link, error: linkError } =
    await service.auth.admin.generateLink({ type: "magiclink", email });
  if (linkError || !link?.properties?.hashed_token) {
    return { ok: false, redirectTo: "/login", reason: "link_failed" };
  }

  return {
    ok: true,
    redirectTo: `/auth/confirm?token_hash=${link.properties.hashed_token}&type=email&next=/portal`,
  };
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
