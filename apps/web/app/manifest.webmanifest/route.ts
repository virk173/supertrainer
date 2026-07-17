import { NextResponse } from "next/server";

import { getOrgTheme } from "@/lib/brand/theme";
import { getSessionClaims } from "@/lib/onboarding/state";

// Dynamic, org-branded PWA manifest (Phase 2.4). A client installs their COACH's
// app, not a generic one — so name/theme/icons resolve from the signed-in
// client's org. Unauthenticated visitors get the platform default.
//
// The <link rel="manifest"> must carry crossorigin="use-credentials" (see the
// root layout) or the browser fetches this without cookies and always gets the
// generic manifest.

function iconUrl(size: number, letter: string, color: string, logo?: string | null) {
  const params = new URLSearchParams({ size: String(size), letter, color });
  if (logo) params.set("logo", logo);
  return `/api/icon?${params.toString()}`;
}

export async function GET() {
  const { orgId } = await getSessionClaims();
  const theme = orgId ? await getOrgTheme(orgId) : null;

  const name = theme?.name ?? "supertrainer";
  const color = theme?.brand.primaryColor ?? "#171717";
  const letter = name.slice(0, 1).toUpperCase();
  const logo = theme?.brand.logoUrl ?? null;

  return NextResponse.json(
    {
      name,
      short_name: name.slice(0, 12),
      description: `Coaching with ${name}`,
      // Installed clients land in the portal; scope covers the whole app so
      // in-app navigation stays standalone.
      start_url: "/portal",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#ffffff",
      theme_color: color,
      icons: [
        {
          src: iconUrl(192, letter, color, logo),
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: iconUrl(512, letter, color, logo),
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
        {
          src: iconUrl(512, letter, color, logo),
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    {
      headers: {
        "content-type": "application/manifest+json",
        // Per-user content — never share across clients via a CDN.
        "cache-control": "private, no-store",
      },
    },
  );
}
