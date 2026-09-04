import type { MetadataRoute } from "next";

import { COMPETITORS } from "@/lib/marketing/competitors";

// Phase 9.5 — the sitemap lists PUBLIC marketing pages only. App routes are
// behind auth and the legal drafts are noindex until a lawyer has signed them
// off, so neither belongs in a document that invites indexing.

function origin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export default function sitemap(): MetadataRoute.Sitemap {
  const base = origin();
  const now = new Date();

  const paths = [
    { path: "/", priority: 1 },
    { path: "/pricing", priority: 0.9 },
    { path: "/switch", priority: 0.8 },
    { path: "/security", priority: 0.6 },
    { path: "/docs/data", priority: 0.6 },
    ...COMPETITORS.map((c) => ({ path: `/compare/${c.slug}`, priority: 0.7 })),
  ];

  return paths.map(({ path, priority }) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority,
  }));
}
