import path from "node:path";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Workspace packages ship raw TypeScript — Next transpiles them.
  transpilePackages: ["@supertrainer/ai", "@supertrainer/db", "@supertrainer/scoring", "@supertrainer/ui"],
  // Node-only extraction libs (style ingestion) — keep them out of the bundle.
  serverExternalPackages: ["pdf-parse", "mammoth"],
  // Monorepo root — stops Next inferring it from stray lockfiles outside the repo.
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
};

// Source-map upload + release creation only run when Sentry build credentials
// are present, so local dev and CI builds without Sentry are unaffected. The
// runtime SDK (sentry.*.config.ts) initializes independently and no-ops without
// a DSN.
const sentryConfigured = Boolean(
  process.env.SENTRY_AUTH_TOKEN &&
    process.env.SENTRY_ORG &&
    process.env.SENTRY_PROJECT,
);

export default sentryConfigured
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      // Quiet in local builds, verbose in CI.
      silent: !process.env.CI,
      widenClientFileUpload: true,
      // Next 15.4+/Turbopack: upload source maps once, after the build completes.
      useRunAfterProductionCompileHook: true,
      disableLogger: true,
    })
  : nextConfig;
