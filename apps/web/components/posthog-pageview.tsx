"use client";

import { useEffect } from "react";

import { usePathname, useSearchParams } from "next/navigation";

import { track } from "@supertrainer/ui/analytics";

// Captures a $pageview on every App Router client navigation. PostHog's own
// SPA pageview is disabled in the provider, so this is the single source of
// pageviews. Must render inside a Suspense boundary (useSearchParams).
export function PostHogPageview() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;
    let url = window.location.origin + pathname;
    const qs = searchParams?.toString();
    if (qs) url += `?${qs}`;
    track("$pageview", { $current_url: url });
  }, [pathname, searchParams]);

  return null;
}
