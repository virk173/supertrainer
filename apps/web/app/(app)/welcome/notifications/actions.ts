"use server";

import type { Json } from "@supertrainer/db/types";

import { trackServer } from "@/lib/analytics/server";
import { getSessionClaims } from "@/lib/onboarding/state";
import { createClient } from "@/lib/supabase/server";

export interface ChannelResult {
  ok: boolean;
  message?: string;
}

// Resolves the signed-in client's own client row. Uses the authenticated client
// (RLS scopes it to their own record) — notification_channel is the client's own
// preference, not a privileged column.
async function ownClient() {
  const { orgId, userId, role } = await getSessionClaims();
  if (!orgId || !userId || role !== "client") return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("clients")
    .select("id")
    .eq("profile_id", userId)
    .maybeSingle();
  return data ? { clientId: data.id, orgId, supabase } : null;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: Record<string, string>;
  platform: string;
}

// The endpoint is a client-supplied URL that Phase 6's delivery worker will POST
// to, so validate it here: HTTPS and a recognized push-service host only. Fail
// closed — an unrecognized or non-HTTPS endpoint is dropped (not stored as an
// SSRF target), and delivery falls back to the email digest.
const PUSH_HOSTS = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "push.services.mozilla.com",
  "push.apple.com",
  "notify.windows.com",
  "push.microsoft.com",
  "web.push.apple.com",
];
function isValidPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return false;
    return PUSH_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

// Permission granted → move the client up the fallback ladder to 'push' and
// register this device. Without VAPID configured (dev/preview) there's no
// subscription to store — the channel still records the client's choice, and
// Phase 6's delivery falls back to the email digest when no active subscription
// exists for a push-channel client.
export async function enablePush(
  sub: PushSubscriptionInput | null,
): Promise<ChannelResult> {
  const own = await ownClient();
  if (!own) return { ok: false, message: "Please sign in as a client." };
  const { clientId, orgId, supabase } = own;

  if (sub?.endpoint && isValidPushEndpoint(sub.endpoint)) {
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        org_id: orgId,
        client_id: clientId,
        endpoint: sub.endpoint,
        keys: sub.keys as Json,
        platform: sub.platform,
        revoked_at: null,
      },
      { onConflict: "endpoint" },
    );
    if (error) return { ok: false, message: error.message };
  }

  const { error: channelError } = await supabase
    .from("clients")
    .update({ notification_channel: "push" })
    .eq("id", clientId);
  if (channelError) return { ok: false, message: channelError.message };

  await trackServer({
    orgId,
    event: "push_enabled",
    clientId,
    properties: { has_subscription: Boolean(sub?.endpoint), platform: sub?.platform ?? null },
  });
  return { ok: true };
}

// Skipped or denied → stay on the email_only rung of the ladder (Phase 6 sends
// the digest instead). The flow is skippable by design; the channel records it.
export async function skipPush(reason: "skipped" | "denied"): Promise<ChannelResult> {
  const own = await ownClient();
  if (!own) return { ok: false, message: "Please sign in as a client." };
  const { clientId, orgId, supabase } = own;

  const { error } = await supabase
    .from("clients")
    .update({ notification_channel: "email_only" })
    .eq("id", clientId);
  if (error) return { ok: false, message: error.message };

  await trackServer({
    orgId,
    event: "push_skipped",
    clientId,
    properties: { reason },
  });
  return { ok: true };
}

// Fired once the app is detected running standalone (installed).
export async function markInstalled(platform: string): Promise<void> {
  const own = await ownClient();
  if (!own) return;
  await trackServer({
    orgId: own.orgId,
    event: "pwa_installed",
    clientId: own.clientId,
    properties: { platform },
  });
}
