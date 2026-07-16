"use client";

import { useEffect } from "react";

import { usePathname } from "next/navigation";

import { track } from "@supertrainer/ui/analytics";

// Captures a $pageview on every App Router client navigation. PostHog's own
// SPA pageview is disabled in the provider, so this is the single source of
// pageviews.
//
// Reads the URL from window.location inside the effect rather than
// useSearchParams(): useSearchParams forces a client-bailout Suspense boundary,
// which offsets React's useId counter and breaks hydration of useId-based
// components (Radix accordions etc.) elsewhere on the page. usePathname drives
// the effect; window.location.href is read at fire time so the captured URL
// still carries query params.
export function PostHogPageview() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    track("$pageview", { $current_url: window.location.href });
  }, [pathname]);

  return null;
}
