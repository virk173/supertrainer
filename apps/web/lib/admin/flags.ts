import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

import { resolveFlag, type FlagDefinition } from "./flags-core";

// Phase 9.3 — the flag SDK the rest of the app calls: flag(orgId, key).
// Definitions change rarely, so they are cached per request-batch (60s) to keep
// a flag check off the hot path of every render.

interface CacheEntry {
  flags: Map<string, FlagDefinition>;
  at: number;
}

const TTL_MS = 60_000;
let cache: CacheEntry | null = null;

async function definitions(): Promise<Map<string, FlagDefinition>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.flags;
  const service = createServiceClient();
  const { data } = await service
    .from("feature_flags")
    .select("key, enabled_default, rollout_percent");
  const flags = new Map<string, FlagDefinition>(
    (data ?? []).map((f) => [
      f.key,
      { key: f.key, enabledDefault: f.enabled_default, rolloutPercent: f.rollout_percent },
    ]),
  );
  cache = { flags, at: Date.now() };
  return flags;
}

/** Is `key` on for this org? Unknown flags are off. */
export async function flag(orgId: string, key: string): Promise<boolean> {
  const service = createServiceClient();
  const [defs, { data: override }] = await Promise.all([
    definitions(),
    service
      .from("feature_flag_overrides")
      .select("enabled")
      .eq("flag_key", key)
      .eq("org_id", orgId)
      .maybeSingle(),
  ]);
  return resolveFlag(orgId, defs.get(key) ?? null, override ? override.enabled : null);
}

/** Drop the definition cache — used after an admin edits a flag. */
export function invalidateFlagCache(): void {
  cache = null;
}
