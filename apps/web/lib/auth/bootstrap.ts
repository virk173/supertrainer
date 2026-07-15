import type { SupabaseServerClient } from "@supertrainer/db/server";

import { createServiceClient } from "@/lib/supabase/server";

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "org"
  );
}

// Post-signup org bootstrap: first sign-in without a profile creates an org
// and an owner profile, then refreshes the session so the new JWT carries the
// org_id/user_role claims (injected by custom_access_token_hook).
//
// Client-role accounts never pass through here with a missing profile: they
// are created by the invite/teaser claim flow (Phase 2, /join/[token]), which
// creates their profile before their first token refresh. The confirm route
// additionally skips bootstrap for /join redirects.
//
// Runs in a Route Handler (never a Server Component) because refreshSession
// must write cookies.
export async function bootstrapOrgIfNeeded(
  supabase: SupabaseServerClient,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const service = createServiceClient();

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("id, org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw profileError;

  if (!profile) {
    const emailLocal = user.email?.split("@")[0] ?? "trainer";
    const suffix = crypto.randomUUID().slice(0, 6);

    const { data: org, error: orgError } = await service
      .from("orgs")
      .insert({
        name: emailLocal,
        slug: `${slugify(emailLocal)}-${suffix}`,
      })
      .select("id")
      .single();
    if (orgError) throw orgError;

    const { error: insertError } = await service.from("profiles").insert({
      id: user.id,
      org_id: org.id,
      role: "owner",
      display_name: emailLocal,
    });
    if (insertError) throw insertError;

    await service.from("audit_log").insert({
      org_id: org.id,
      actor_profile_id: user.id,
      action: "org.created",
      entity_type: "org",
      entity_id: org.id,
    });
    await service.from("events").insert({
      org_id: org.id,
      type: "trainer.signed_up",
    });
  }

  // Mint a fresh JWT: either the profile was just created, or the user signed
  // in with a token issued before their profile existed.
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.org_id) {
    await supabase.auth.refreshSession();
  }
}
