import "server-only";

import {
  brandSocialLinks,
  orgThemeVars,
  type BrandConfig,
  type SocialPlatform,
} from "@supertrainer/ui/lib/brand";

import { createServiceClient } from "@/lib/supabase/server";

export interface OrgTheme {
  orgId: string;
  name: string;
  slug: string;
  brand: BrandConfig;
  /** CSS custom properties for branded surfaces. */
  vars: React.CSSProperties;
  socials: { platform: SocialPlatform; href: string }[];
}

function toTheme(row: {
  id: string;
  name: string;
  slug: string;
  brand: unknown;
}): OrgTheme {
  const brand = (row.brand ?? {}) as BrandConfig;
  return {
    orgId: row.id,
    name: brand.displayName?.trim() || row.name,
    slug: row.slug,
    brand,
    vars: orgThemeVars(brand),
    socials: brandSocialLinks(brand),
  };
}

// Public brand/theme for an org. Uses the service role because brand is
// public-facing (logos/colors/socials render on unauthenticated teaser pages,
// and clients can't read the orgs table under RLS) — it returns only
// public brand fields, never settings or other columns.
export async function getOrgTheme(orgId: string): Promise<OrgTheme | null> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("orgs")
    .select("id, name, slug, brand")
    .eq("id", orgId)
    .maybeSingle();
  if (error || !data) return null;
  return toTheme(data);
}

// Same, resolved by public slug — the entry point for /c/{slug} and
// {slug}.<platform> branded client-facing pages.
export async function getOrgThemeBySlug(slug: string): Promise<OrgTheme | null> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("orgs")
    .select("id, name, slug, brand")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return null;
  return toTheme(data);
}
