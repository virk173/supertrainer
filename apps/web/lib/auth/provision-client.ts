import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

type ServiceClient = ReturnType<typeof createServiceClient>;

export type ProvisionClientAccountResult =
  | { ok: true; userId: string }
  | { ok: false; step: "create_user" | "profile_insert" };

// Shared "create client auth account" step for the two flows that provision a
// brand-new client login: teaser conversion (convertLead) and invite
// acceptance (claimInvite) — SF-4/SF-5 dedup. Creates the auth.users row, then
// a client-role profiles row; a profile-insert failure rolls back the auth
// user (deleteUser) so a retry starts clean instead of leaving an orphaned
// auth user with no profile.
//
// Callers keep their own divergent error messaging/redirects/reason codes —
// this only reports which step failed so each call site can map it to its own
// UX (e.g. "already registered" vs "invite invalid").
export async function provisionClientAuthAccount(
  service: ServiceClient,
  orgId: string,
  email: string,
): Promise<ProvisionClientAccountResult> {
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (createError || !created?.user) {
    return { ok: false, step: "create_user" };
  }
  const userId = created.user.id;

  const { error: profileError } = await service
    .from("profiles")
    .insert({ id: userId, org_id: orgId, role: "client" });
  if (profileError) {
    await service.auth.admin.deleteUser(userId);
    return { ok: false, step: "profile_insert" };
  }

  return { ok: true, userId };
}

// One-time magic-link confirm URL that signs a just-provisioned/claimed client
// in and lands them on /portal. Returns null on link-generation failure so
// each caller can apply its own fallback redirect.
export async function buildClientMagicLinkUrl(
  service: ServiceClient,
  email: string,
): Promise<string | null> {
  const { data: link, error } = await service.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error || !link?.properties?.hashed_token) return null;
  return `/auth/confirm?token_hash=${link.properties.hashed_token}&type=email&next=/portal`;
}
