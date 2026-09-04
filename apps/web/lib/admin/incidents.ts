import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

// Phase 9.3 — the read side of the status banner. Cached briefly so a live
// incident does not add a query to every render, and fails SILENT: if this
// lookup breaks, people see the app, not an error about the error system.

export interface LiveIncident {
  id: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
  maintenanceMode: boolean;
}

const TTL_MS = 30_000;
let cache: { at: number; rows: LiveIncident[] } | null = null;

/** Drop the cache the moment an operator publishes or ends an incident. A
 *  status banner that lags the incident by half a minute is worse than useless
 *  during the half-minute that matters most. */
export function invalidateIncidentCache(): void {
  cache = null;
}

async function liveRows(): Promise<LiveIncident[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  try {
    const service = createServiceClient();
    const now = new Date().toISOString();
    const { data } = await service
      .from("platform_incidents")
      .select("id, title, body, severity, surface, maintenance_mode, starts_at, ends_at")
      .eq("published", true)
      .lte("starts_at", now)
      .order("starts_at", { ascending: false })
      .limit(5);
    const rows = (data ?? [])
      .filter((i) => !i.ends_at || i.ends_at > now)
      .map((i) => ({
        id: i.id,
        title: i.title,
        body: i.body,
        severity: i.severity,
        maintenanceMode: i.maintenance_mode,
        surface: i.surface,
      }));
    cache = { at: Date.now(), rows: rows as unknown as LiveIncident[] };
    // keep the surface for filtering without widening the public type
    (cache as { rows: (LiveIncident & { surface?: string })[] }).rows = rows as never;
    return cache.rows;
  } catch {
    return [];
  }
}

/** The incident to show on one surface, if any. */
export async function liveIncident(
  surface: "portal" | "dashboard",
): Promise<LiveIncident | null> {
  const rows = (await liveRows()) as (LiveIncident & { surface?: string })[];
  const match = rows.find((r) => r.surface === "both" || r.surface === surface);
  return match ?? null;
}

/** Are writes paused for this surface? */
export async function inMaintenance(surface: "portal" | "dashboard"): Promise<boolean> {
  const incident = await liveIncident(surface);
  return Boolean(incident?.maintenanceMode);
}
