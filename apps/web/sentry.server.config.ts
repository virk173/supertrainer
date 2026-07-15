// Server-side Sentry init (Node runtime). Loaded by instrumentation.ts.
// No-ops without SENTRY_DSN so local dev, CI, and tests run untouched.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  // Ties errors to a deploy. `release` is auto-detected from the Vercel git SHA
  // (injected as SENTRY_RELEASE by withSentryConfig at build time).
  environment: process.env.VERCEL_ENV ?? "development",
  tracesSampleRate: 1.0,
  debug: false,
});
