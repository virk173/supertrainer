"use client";

import * as React from "react";
import Image from "next/image";
import {
  AlertTriangle,
  Camera,
  Check,
  Globe,
  Loader2,
  Music,
  Upload,
  Video,
} from "lucide-react";

import { Button } from "@supertrainer/ui/components/button";
import { Input } from "@supertrainer/ui/components/input";
import { Label } from "@supertrainer/ui/components/label";
import {
  brandSocialLinks,
  type BrandConfig,
  type SocialPlatform,
} from "@supertrainer/ui/lib/brand";
import { parseHex, primaryColorPassesAA, readableTextOn } from "@supertrainer/ui/lib/contrast";
import { cn } from "@supertrainer/ui/lib/utils";
import { createSupabaseBrowserClient } from "@supertrainer/db/browser";

import { saveBrand } from "@/app/onboarding/brand/actions";
import { initialBrandFormState } from "@/app/onboarding/brand/form-state";
import { SLUG_MAX, slugify, validateSlug, SLUG_ERROR_MESSAGE } from "@/lib/brand/slug";

const PLATFORM_DOMAIN =
  process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "supertrainer.app";
const DEFAULT_COLOR = "#4f46e5";
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

// This lucide build ships no brand marks — map socials to generic glyphs.
const SOCIAL_ICON: Record<SocialPlatform, React.ComponentType<{ className?: string }>> = {
  instagram: Camera,
  youtube: Video,
  tiktok: Music,
  website: Globe,
};

export function BrandForm({
  orgId,
  orgName,
  initialSlug,
  initialBrand,
}: {
  orgId: string;
  orgName: string;
  initialSlug: string;
  initialBrand: BrandConfig;
}) {
  const [state, formAction, pending] = React.useActionState(
    saveBrand,
    initialBrandFormState,
  );

  const [displayName, setDisplayName] = React.useState(
    initialBrand.displayName ?? orgName,
  );
  const [slug, setSlug] = React.useState(initialSlug);
  const [color, setColor] = React.useState(initialBrand.primaryColor ?? DEFAULT_COLOR);
  const [logoUrl, setLogoUrl] = React.useState<string | null>(
    initialBrand.logoUrl ?? null,
  );
  const [socials, setSocials] = React.useState({
    instagram: initialBrand.socials?.instagram ?? "",
    youtube: initialBrand.socials?.youtube ?? "",
    tiktok: initialBrand.socials?.tiktok ?? "",
    website: initialBrand.socials?.website ?? "",
  });
  const [logoError, setLogoError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);

  const slugError = slug ? validateSlug(slug) : "too_short";
  const colorValid = Boolean(parseHex(color));
  const colorPassesAA = colorValid && primaryColorPassesAA(color);
  const onColor = colorValid ? readableTextOn(parseHex(color)!).onColor : "#ffffff";

  async function handleLogo(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setLogoError(null);

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setLogoError("Use a PNG, JPG, WebP, or GIF image.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError("Image must be under 2 MB.");
      return;
    }

    setUploading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
      // Org-scoped path; the crypto-random suffix busts CDN cache on re-upload.
      const path = `${orgId}/logo-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from("brand")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) {
        setLogoError(error.message);
        return;
      }
      const { data } = supabase.storage.from("brand").getPublicUrl(path);
      setLogoUrl(data.publicUrl);
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  const previewBrand: BrandConfig = {
    displayName,
    logoUrl,
    primaryColor: colorValid ? color : undefined,
    socials,
  };
  const previewSocials = brandSocialLinks(previewBrand);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <form action={formAction} className="space-y-6" data-testid="brand-form">
        <input type="hidden" name="logoUrl" value={logoUrl ?? ""} />

        {/* Display name */}
        <div className="space-y-2">
          <Label htmlFor="displayName">Display name</Label>
          <Input
            id="displayName"
            name="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={80}
            required
          />
          {state.errors.displayName && (
            <FieldError>{state.errors.displayName}</FieldError>
          )}
        </div>

        {/* Logo */}
        <div className="space-y-2">
          <Label htmlFor="logo">Logo</Label>
          <div className="flex items-center gap-4">
            <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-surface">
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  alt="Brand logo preview"
                  width={64}
                  height={64}
                  className="size-full object-contain"
                  unoptimized
                />
              ) : (
                <span className="text-xs text-muted-foreground">No logo</span>
              )}
            </div>
            <div className="space-y-1">
              <Button asChild variant="outline" size="sm" disabled={uploading}>
                <label htmlFor="logo" className="cursor-pointer">
                  {uploading ? (
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                  ) : (
                    <Upload aria-hidden="true" className="size-4" />
                  )}
                  {uploading ? "Uploading…" : "Upload image"}
                  <input
                    id="logo"
                    type="file"
                    accept={ACCEPTED_TYPES.join(",")}
                    className="sr-only"
                    onChange={handleLogo}
                    data-testid="logo-input"
                  />
                </label>
              </Button>
              <p className="text-xs text-muted-foreground">
                PNG, JPG, WebP, or GIF — up to 2 MB.
              </p>
            </div>
          </div>
          {logoError && <FieldError data-testid="logo-error">{logoError}</FieldError>}
        </div>

        {/* Primary color */}
        <div className="space-y-2">
          <Label htmlFor="primaryColorText">Primary color</Label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              aria-label="Primary color picker"
              value={colorValid ? color : DEFAULT_COLOR}
              onChange={(e) => setColor(e.target.value)}
              className={cn(
                "size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5",
              )}
            />
            <Input
              id="primaryColorText"
              name="primaryColor"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="max-w-40 font-mono"
              spellCheck={false}
            />
          </div>
          {colorValid && !colorPassesAA && (
            <p
              className="flex items-center gap-1.5 text-xs text-warning-text"
              data-testid="contrast-warning"
            >
              <AlertTriangle aria-hidden="true" className="size-3.5" />
              Low contrast — text may be hard to read on this color.
            </p>
          )}
          {state.errors.primaryColor && (
            <FieldError>{state.errors.primaryColor}</FieldError>
          )}
        </div>

        {/* Handle / slug */}
        <div className="space-y-2">
          <Label htmlFor="slug">Handle</Label>
          <div className="flex items-center rounded-md border border-input focus-within:ring-1 focus-within:ring-ring">
            <span className="px-3 text-sm text-muted-foreground">
              {PLATFORM_DOMAIN}/c/
            </span>
            <input
              id="slug"
              name="slug"
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              maxLength={SLUG_MAX}
              spellCheck={false}
              className="h-9 w-full rounded-r-md bg-transparent pr-3 text-sm outline-none"
              data-testid="slug-input"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Also reachable at{" "}
            <span className="font-mono">
              {slug || "your-handle"}.{PLATFORM_DOMAIN}
            </span>
            . Custom domains coming later.
          </p>
          {slug && slugError && (
            <FieldError data-testid="slug-format-error">
              {SLUG_ERROR_MESSAGE[slugError]}
            </FieldError>
          )}
          {state.errors.slug && <FieldError>{state.errors.slug}</FieldError>}
        </div>

        {/* Socials */}
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Social links</legend>
          {(Object.keys(socials) as SocialPlatform[]).map((platform) => {
            const Icon = SOCIAL_ICON[platform];
            return (
              <div key={platform} className="flex items-center gap-2">
                <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                <Input
                  name={platform}
                  value={socials[platform]}
                  onChange={(e) =>
                    setSocials((s) => ({ ...s, [platform]: e.target.value }))
                  }
                  placeholder={
                    platform === "website" ? "yoursite.com" : `@your-${platform}`
                  }
                  aria-label={platform}
                />
              </div>
            );
          })}
        </fieldset>

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" disabled={pending || uploading} data-testid="save-brand">
            {pending && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
            Save brand
          </Button>
          {state.ok && (
            <span
              className="flex items-center gap-1.5 text-sm text-success"
              data-testid="brand-saved"
            >
              <Check aria-hidden="true" className="size-4" /> {state.message}
            </span>
          )}
          {state.message && !state.ok && (
            <span className="text-sm text-danger">{state.message}</span>
          )}
        </div>
      </form>

      {/* Live preview */}
      <aside className="space-y-4 lg:sticky lg:top-8 lg:self-start">
        <p className="metric-label">Live preview</p>

        {/* Mini portal mockup */}
        <div
          className="overflow-hidden rounded-xl border bg-card shadow-sm"
          style={{ ["--brand-primary" as string]: colorValid ? color : DEFAULT_COLOR, ["--brand-on-primary" as string]: onColor }}
          data-testid="brand-preview"
        >
          <div
            className="flex items-center gap-2 px-4 py-3"
            style={{ background: "var(--brand-primary)", color: "var(--brand-on-primary)" }}
          >
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt=""
                width={24}
                height={24}
                className="size-6 rounded object-contain"
                unoptimized
              />
            ) : (
              <span className="flex size-6 items-center justify-center rounded bg-white/20 text-xs font-semibold">
                {(displayName || orgName).slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="truncate text-sm font-semibold" data-testid="preview-name">
              {displayName || orgName}
            </span>
          </div>
          <div className="space-y-2 p-4">
            <div className="h-2 w-2/3 rounded bg-muted" />
            <div className="h-2 w-1/2 rounded bg-muted" />
            <button
              type="button"
              tabIndex={-1}
              className="mt-2 w-full rounded-md py-1.5 text-xs font-medium"
              style={{ background: "var(--brand-primary)", color: "var(--brand-on-primary)" }}
            >
              Start coaching
            </button>
          </div>
          {previewSocials.length > 0 && (
            <div className="flex items-center gap-3 border-t px-4 py-2 text-muted-foreground">
              {previewSocials.map(({ platform }) => {
                const Icon = SOCIAL_ICON[platform];
                return <Icon key={platform} aria-hidden="true" className="size-3.5" />;
              })}
            </div>
          )}
        </div>

        {/* Plan-PDF header mockup */}
        <div className="overflow-hidden rounded-md border bg-card shadow-sm">
          <div
            className="h-1.5 w-full"
            style={{ background: colorValid ? color : DEFAULT_COLOR }}
          />
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-xs font-semibold">{displayName || orgName}</p>
              <p className="text-[10px] text-muted-foreground">Training plan · Week 1</p>
            </div>
            {logoUrl ? (
              <Image src={logoUrl} alt="" width={20} height={20} className="size-5 object-contain" unoptimized />
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  );
}

function FieldError({
  children,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p className="text-xs text-danger" {...props}>
      {children}
    </p>
  );
}
