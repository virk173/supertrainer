"use client";

import * as React from "react";

import { cn } from "@supertrainer/ui/lib/utils";
import { Button } from "@supertrainer/ui/components/button";

/*
 * Presentational fallback, exported separately so Next.js error.tsx files
 * (which receive { error, reset } from the framework) can reuse it without
 * the boundary class.
 */
function ErrorFallback({
  title = "Something went wrong",
  description = "The rest of the app is still working. Try again, and if it keeps failing, reload the page.",
  onRetry,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      data-slot="error-fallback"
      className={cn(
        "flex min-h-52 flex-col items-center justify-center gap-1 rounded-lg border border-danger/30 bg-danger/5 p-8 text-center",
        className,
      )}
      {...props}
    >
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {onRetry ? (
        <div className="mt-4">
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}

type ErrorBoundaryProps = {
  children: React.ReactNode;
  /** Rendered instead of the default fallback. Receives the retry handler. */
  fallback?: (retry: () => void) => React.ReactNode;
  /** Reported on catch — Phase 0.5 wires this to Sentry. */
  onError?: (error: Error, info: React.ErrorInfo) => void;
};

class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.props.onError?.(error, info);
  }

  retry = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback?.(this.retry) ?? (
          <ErrorFallback onRetry={this.retry} />
        )
      );
    }
    return this.props.children;
  }
}

export { ErrorBoundary, ErrorFallback };
