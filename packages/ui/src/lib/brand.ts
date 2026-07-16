import type { CSSProperties } from "react";

import { parseHex, readableTextOn } from "@supertrainer/ui/lib/contrast";

// The shape persisted in orgs.brand (jsonb). Every field optional — a brand is
// built up incrementally and rendered with fallbacks until then.
export interface BrandConfig {
  displayName?: string;
  logoUrl?: string | null;
  primaryColor?: string;
  socials?: BrandSocials;
}

export interface BrandSocials {
  instagram?: string;
  youtube?: string;
  tiktok?: string;
  website?: string;
}

export const SOCIAL_PLATFORMS = [
  "instagram",
  "youtube",
  "tiktok",
  "website",
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

// Normalizes a brand's socials into an ordered, render-ready list, dropping
// empty entries. The consumer maps `platform` to an icon.
export function brandSocialLinks(
  brand: BrandConfig | null | undefined,
): { platform: SocialPlatform; href: string }[] {
  const socials = brand?.socials ?? {};
  return SOCIAL_PLATFORMS.flatMap((platform) => {
    const raw = socials[platform]?.trim();
    if (!raw) return [];
    return [{ platform, href: normalizeSocialHref(platform, raw) }];
  });
}

// Accepts a full URL or a bare handle/domain and returns an absolute href.
function normalizeSocialHref(platform: SocialPlatform, value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  const handle = value.replace(/^@/, "");
  switch (platform) {
    case "instagram":
      return `https://instagram.com/${handle}`;
    case "youtube":
      return `https://youtube.com/@${handle}`;
    case "tiktok":
      return `https://tiktok.com/@${handle}`;
    case "website":
      return `https://${value.replace(/^\/+/, "")}`;
  }
}

// CSS custom properties that theme branded surfaces (teaser, portal, tier
// cards) in the org's primary color with a legible on-color. Returns an empty
// object when there's no valid color yet, so the design-token defaults show
// through. This is the pure transform behind apps/web's getOrgTheme(orgId).
export function orgThemeVars(
  brand: BrandConfig | null | undefined,
): CSSProperties {
  const rgb = brand?.primaryColor ? parseHex(brand.primaryColor) : null;
  if (!rgb || !brand?.primaryColor) return {};
  const { onColor } = readableTextOn(rgb);
  return {
    ["--brand-primary" as string]: brand.primaryColor,
    ["--brand-on-primary" as string]: onColor,
  };
}
