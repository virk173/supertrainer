import posthog from "posthog-js";

/**
 * Client-side custom event capture. No-ops when PostHog isn't configured.
 * Use inside client components only — this calls the browser SDK. For
 * server-side events (which also write the events table), use the server
 * `trackServer` helper in apps/web/lib/analytics/server.ts.
 */
export function track(
  event: string,
  properties?: Record<string, unknown>,
): void {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  posthog.capture(event, properties);
}
