// Edge-runtime Sentry init (middleware, edge routes). Loaded by
// instrumentation.ts. No-ops without SENTRY_DSN.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV ?? "development",
  tracesSampleRate: 1.0,
  debug: false,
});
