import "server-only";

import { cookies, headers } from "next/headers";

import { rpID } from "@/lib/admin/webauthn";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionClaims } from "@/lib/onboarding/state";

// Phase 9.3 — who is allowed into /admin, and on what proof.
//
// Two independent facts must both hold:
//   1. the signed-in profile is listed in platform_admins, and
//   2. that profile holds a LIVE elevation — a WebAuthn assertion from a
//      physical authenticator, made in the last 30 minutes.
//
// A stolen session cookie alone gets you nothing; a stolen laptop stops working
// half an hour after it's carried away. Neither check trusts anything the
// browser sends beyond the session and the elevation id (which is looked up
// server-side, never decoded).

export const ELEVATION_COOKIE = "st_admin_elevation";
export const ELEVATION_MINUTES = 30;

export interface AdminIdentity {
  profileId: string;
  /** true only when a live elevation backs this request */
  elevated: boolean;
  /** the org the admin's own profile belongs to (they are also a normal user) */
  orgId: string | null;
  hasCredential: boolean;
}

/** The bootstrap allowlist: the only way to become the FIRST platform admin on a
 *  fresh deployment. Empty in every normal environment. */
function bootstrapEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

async function isListedAdmin(profileId: string): Promise<boolean> {
  const service = createServiceClient();
  const { data } = await service
    .from("platform_admins")
    .select("profile_id")
    .eq("profile_id", profileId)
    .maybeSingle();
  return Boolean(data);
}

/** Promote an allowlisted email into platform_admins on first sign-in. Runs only
 *  when PLATFORM_ADMIN_EMAILS names them — never on a bare request. */
async function bootstrapIfAllowlisted(profileId: string): Promise<boolean> {
  const allow = bootstrapEmails();
  if (allow.length === 0) return false;

  const service = createServiceClient();
  const { data: user } = await service.auth.admin.getUserById(profileId);
  const email = user?.user?.email?.toLowerCase();
  if (!email || !allow.includes(email)) return false;

  await service.from("platform_admins").upsert({ profile_id: profileId, note: "bootstrap allowlist" });
  return true;
}

/** Resolve the caller's admin identity. Returns null for everyone else — the
 *  console must be invisible, not merely forbidden. */
export async function adminIdentity(): Promise<AdminIdentity | null> {
  const { userId, orgId } = await getSessionClaims();
  if (!userId) return null;

  let listed = await isListedAdmin(userId);
  if (!listed) listed = await bootstrapIfAllowlisted(userId);
  if (!listed) return null;

  const service = createServiceClient();
  const jar = await cookies();
  const elevationId = jar.get(ELEVATION_COOKIE)?.value ?? null;

  let elevated = false;
  if (elevationId) {
    const { data: session } = await service
      .from("admin_sessions")
      .select("profile_id, elevated_until, revoked_at")
      .eq("id", elevationId)
      .maybeSingle();
    elevated = Boolean(
      session &&
        session.profile_id === userId &&
        !session.revoked_at &&
        new Date(session.elevated_until).getTime() > Date.now(),
    );
  }

  // Scoped to the CURRENT hostname. A key registered for another domain cannot
  // produce an assertion here, so offering "unlock" with it would be a dead end
  // — and, since registration is gated on already having one, a lockout.
  const { count } = await service
    .from("admin_credentials")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", userId)
    .eq("rp_id", rpID());

  return { profileId: userId, elevated, orgId, hasCredential: (count ?? 0) > 0 };
}

/** Open an elevation after a verified assertion. */
export async function openElevation(
  profileId: string,
  credentialRowId: string | null,
): Promise<string> {
  const service = createServiceClient();
  const hdrs = await headers();
  const { data, error } = await service
    .from("admin_sessions")
    .insert({
      profile_id: profileId,
      credential_id: credentialRowId,
      elevated_until: new Date(Date.now() + ELEVATION_MINUTES * 60_000).toISOString(),
      ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      user_agent: hdrs.get("user-agent"),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("admin: could not open an elevation");
  return data.id;
}

/** End the current elevation (sign out of the console without signing out). */
export async function closeElevation(elevationId: string): Promise<void> {
  const service = createServiceClient();
  await service
    .from("admin_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", elevationId);
}
