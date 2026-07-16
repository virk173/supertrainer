import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Camera, Globe, Music, Video } from "lucide-react";

import type { SocialPlatform } from "@supertrainer/ui/lib/brand";

import { getOrgThemeBySlug } from "@/lib/brand/theme";

// This lucide build ships no brand marks — map socials to generic glyphs.
const SOCIAL_ICON: Record<
  SocialPlatform,
  React.ComponentType<{ className?: string }>
> = {
  instagram: Camera,
  youtube: Video,
  tiktok: Music,
  website: Globe,
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const theme = await getOrgThemeBySlug(slug);
  return { title: theme ? `${theme.name} — coaching` : "Coaching" };
}

// Branded client-facing landing for {slug}.<platform> and /c/{slug}. This is a
// teaser stub in P1.2 — it proves brand resolution and theming end-to-end; the
// full teaser funnel (tier unlock, first-log) is built in Phase 2.
export default async function BrandedLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const theme = await getOrgThemeBySlug(slug);
  if (!theme) notFound();

  const { name, brand, socials, vars } = theme;

  return (
    <main
      style={vars}
      className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center gap-6 px-6 py-16 text-center"
    >
      <div className="flex flex-col items-center gap-4">
        {brand.logoUrl ? (
          <Image
            src={brand.logoUrl}
            alt={`${name} logo`}
            width={72}
            height={72}
            className="size-18 rounded-xl object-contain"
            unoptimized
          />
        ) : (
          <span
            className="flex size-16 items-center justify-center rounded-xl text-2xl font-semibold"
            style={{
              background: "var(--brand-primary, var(--color-primary))",
              color: "var(--brand-on-primary, var(--color-primary-foreground))",
            }}
          >
            {name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="branded-name">
            {name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Personalized coaching, powered by AI.
          </p>
        </div>
      </div>

      <Link
        href={`/c/${slug}/start`}
        className="rounded-md px-5 py-2.5 text-sm font-medium"
        style={{
          background: "var(--brand-primary, var(--color-primary))",
          color: "var(--brand-on-primary, var(--color-primary-foreground))",
        }}
        data-testid="start-cta"
      >
        Start your journey
      </Link>

      {socials.length > 0 && (
        <footer className="flex items-center gap-4 pt-4 text-muted-foreground">
          {socials.map(({ platform, href }) => {
            const Icon = SOCIAL_ICON[platform];
            return (
              <a
                key={platform}
                href={href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                aria-label={`${name} on ${platform}`}
                className="transition-colors hover:text-foreground"
              >
                <Icon className="size-5" />
              </a>
            );
          })}
        </footer>
      )}
    </main>
  );
}
