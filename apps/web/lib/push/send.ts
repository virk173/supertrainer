import webpush from "web-push";

// Phase 6.2 — the Web Push transport. No-ops when VAPID keys are unset (dev/CI/
// preview), so the ladder degrades to badge + email instead of throwing. A push
// service replying 404/410 means the endpoint is dead — the worker prunes it.

export interface PushSubscriptionShape {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export type PushResult =
  | { ok: true }
  | { dead: true } // endpoint gone (404/410) — prune it
  | { ok: false; error: string };

// Injectable so the worker's tests can drive delivery without a real push service.
export type PushFn = (sub: PushSubscriptionShape, payload: unknown) => Promise<PushResult>;

let vapidReady: boolean | null = null;

function ensureVapid(): boolean {
  if (vapidReady !== null) return vapidReady;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    vapidReady = false;
    return false;
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:notifications@supertrainer.app", pub, priv);
  vapidReady = true;
  return true;
}

export const sendWebPush: PushFn = async (sub, payload) => {
  if (!ensureVapid()) return { ok: false, error: "no_vapid" };
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      JSON.stringify(payload),
    );
    return { ok: true };
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return { dead: true };
    return { ok: false, error: err instanceof Error ? err.message : "push_failed" };
  }
};
