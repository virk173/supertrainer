"use client";

import { useEffect } from "react";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";

let initialized = false;

function initPostHog(): void {
  if (initialized) return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    // App Router client navigations are captured manually (apps/web
    // PostHogPageview) — disable the SDK's own pageview so counts aren't doubled.
    capture_pageview: false,
    capture_pageleave: true,
    person_profiles: "identified_only",
  });
  initialized = true;
}

/**
 * Wraps the app with PostHog. Initializes the browser SDK when
 * NEXT_PUBLIC_POSTHOG_KEY is set; otherwise renders children untouched so dev
 * and preview environments without analytics are unaffected.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const enabled = Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY);

  useEffect(() => {
    if (enabled) initPostHog();
  }, [enabled]);

  if (!enabled) return <>{children}</>;
  return <PHProvider client={posthog}>{children}</PHProvider>;
}
