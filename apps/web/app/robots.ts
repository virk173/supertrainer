import type { MetadataRoute } from "next";

// Phase 9.5 — index the marketing site; never the app, the console, the client
// portal, or a coach's branded page.

function origin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin",
          "/trainer",
          "/portal",
          "/onboarding",
          "/join",
          "/consent",
          "/welcome",
          "/c/",
          "/r/",
          "/legal/",
          "/styleguide",
        ],
      },
    ],
    sitemap: `${origin()}/sitemap.xml`,
  };
}
