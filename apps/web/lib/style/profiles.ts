import "server-only";

import { serializeStyleProfile } from "@supertrainer/ai";
import type { Database } from "@supertrainer/db/types";

import { createServiceClient } from "@/lib/supabase/server";

export type StyleDomain = Database["public"]["Enums"]["style_domain"];
export const STYLE_DOMAIN_ORDER: StyleDomain[] = ["diet", "training", "voice"];

export interface StyleProfileRow {
  domain: StyleDomain;
  version: number;
  profile: Record<string, unknown>;
  status: Database["public"]["Enums"]["style_profile_status"];
  confidence: number | null;
}

// The confirmed style profile for a domain, plus a prompt-cache-friendly
// serialization for injection into P4/P5/P6 prompts. DoD helper for Phase 1.3.
// Service role: called from server jobs/actions that act for the org.
export async function getStyleProfile(
  orgId: string,
  domain: StyleDomain,
): Promise<{ profile: Record<string, unknown>; serialized: string } | null> {
  const service = createServiceClient();
  const { data } = await service
    .from("style_profiles")
    .select("profile")
    .eq("org_id", orgId)
    .eq("domain", domain)
    .eq("status", "confirmed")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const profile = (data.profile ?? {}) as Record<string, unknown>;
  return { profile, serialized: serializeStyleProfile(domain, profile) };
}

// All of an org's current style profiles (draft or confirmed), newest version
// per domain — drives the confirmation UI and resume behavior.
export async function getOrgStyleProfiles(
  orgId: string,
): Promise<StyleProfileRow[]> {
  const service = createServiceClient();
  const { data } = await service
    .from("style_profiles")
    .select("domain, version, profile, status, confidence")
    .eq("org_id", orgId)
    .order("version", { ascending: false });

  const byDomain = new Map<StyleDomain, StyleProfileRow>();
  for (const row of data ?? []) {
    const domain = row.domain as StyleDomain;
    if (!byDomain.has(domain)) {
      byDomain.set(domain, {
        domain,
        version: row.version,
        profile: (row.profile ?? {}) as Record<string, unknown>,
        status: row.status,
        confidence: row.confidence,
      });
    }
  }
  return STYLE_DOMAIN_ORDER.filter((d) => byDomain.has(d)).map(
    (d) => byDomain.get(d)!,
  );
}
