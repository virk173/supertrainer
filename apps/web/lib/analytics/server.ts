import "server-only";

import { PostHog } from "posthog-node";

import { createSupabaseServiceRoleClient } from "@supertrainer/db/server";
import type { Json } from "@supertrainer/db/types";

// Lazy, credential-gated PostHog node client. undefined = unresolved,
// null = disabled (no key).
let posthog: PostHog | null | undefined;

function getPostHog(): PostHog | null {
  if (posthog !== undefined) return posthog;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) {
    posthog = null;
    return null;
  }
  posthog = new PostHog(key, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
  });
  return posthog;
}

export interface ServerEvent {
  /** Owning org (events.org_id — required, RLS-scoped). */
  orgId: string;
  /** Event name (events.type / PostHog event). */
  event: string;
  /** Related client, if any (events.client_id). */
  clientId?: string | null;
  /** PostHog distinct id; defaults to the org id. */
  distinctId?: string;
  /** Arbitrary event properties (events.payload / PostHog properties). */
  properties?: Record<string, unknown>;
}

/**
 * Server-side event capture. Writes to BOTH the events table (the funnel spine,
 * source of truth) and PostHog. Best-effort: a telemetry failure is logged, not
 * thrown, so it never breaks the user action. Phases needing a guaranteed event
 * write should insert via packages/db within their own transaction instead.
 */
export async function trackServer(event: ServerEvent): Promise<void> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { error } = await supabase.from("events").insert({
      org_id: event.orgId,
      client_id: event.clientId ?? null,
      type: event.event,
      payload: (event.properties ?? {}) as Json,
    });
    if (error) {
      console.error("[analytics] events insert failed:", error.message);
    }
  } catch (err) {
    console.error("[analytics] events insert threw:", err);
  }

  const client = getPostHog();
  if (!client) return;
  try {
    client.capture({
      distinctId: event.distinctId ?? event.orgId,
      event: event.event,
      properties: {
        orgId: event.orgId,
        ...(event.clientId ? { clientId: event.clientId } : {}),
        ...event.properties,
      },
    });
    // Serverless: flush before the function freezes.
    await client.flush();
  } catch (err) {
    console.error("[analytics] posthog capture failed:", err);
  }
}
