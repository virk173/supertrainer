import Image from "next/image";
import { notFound } from "next/navigation";

import { getOrgThemeBySlug } from "@/lib/brand/theme";
import { StageAForm } from "@/components/stage-a-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const theme = await getOrgThemeBySlug(slug);
  return { title: theme ? `Start with ${theme.name}` : "Start" };
}

// Public Stage A teaser intake for {slug} (Phase 2.1). Org-branded via
// getOrgThemeBySlug; the one-question-per-screen flow lives in StageAForm.
export default async function StageAStartPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const theme = await getOrgThemeBySlug(slug);
  if (!theme) notFound();

  const { name, brand, vars } = theme;

  return (
    <main style={vars} className="min-h-[100dvh] bg-background">
      <header className="mx-auto flex max-w-md items-center gap-3 px-6 pt-8">
        {brand.logoUrl ? (
          <Image
            src={brand.logoUrl}
            alt={`${name} logo`}
            width={36}
            height={36}
            className="size-9 rounded-lg object-contain"
            unoptimized
          />
        ) : (
          <span
            className="flex size-9 items-center justify-center rounded-lg text-sm font-semibold"
            style={{
              background: "var(--brand-primary, var(--color-primary))",
              color: "var(--brand-on-primary, var(--color-primary-foreground))",
            }}
          >
            {name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="leading-tight">
          <p className="text-sm font-semibold" data-testid="teaser-coach">
            {name}
          </p>
          <p className="text-xs text-muted-foreground">2-minute intake</p>
        </div>
      </header>

      <StageAForm slug={slug} />
    </main>
  );
}
