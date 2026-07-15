"use client";

import { ErrorFallback } from "@supertrainer/ui/components/error-boundary";

// Route-segment error boundary: an uncaught render/data error in any page keeps
// the app shell and offers a retry instead of a blank crash. Phase 0.5 wires
// reportError() here for Sentry.
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <ErrorFallback onRetry={reset} className="max-w-md" />
    </div>
  );
}
