// Next.js server instrumentation entry (App Router). Registers the Sentry
// server/edge configs per runtime and forwards Server Component / middleware
// errors to Sentry via onRequestError.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    // Phase 9.3 — the AI margin meter. Installed here so every Claude call in
    // the process is priced, whatever route or job made it.
    const { installAiUsageSink } = await import("./lib/admin/usage-sink");
    installAiUsageSink();
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
