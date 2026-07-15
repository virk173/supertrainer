"use client";

import * as React from "react";

import { Button } from "@supertrainer/ui/components/button";
import {
  ErrorBoundary,
  ErrorFallback,
} from "@supertrainer/ui/components/error-boundary";

function Bomb(): React.ReactNode {
  throw new Error("styleguide error-boundary demo");
}

/* Live boundary: trigger a render error, watch the fallback catch it, retry. */
export function ErrorDemo() {
  const [armed, setArmed] = React.useState(false);

  return (
    <ErrorBoundary
      fallback={(retry) => (
        <ErrorFallback
          onRetry={() => {
            setArmed(false);
            retry();
          }}
        />
      )}
    >
      {armed ? (
        <Bomb />
      ) : (
        <div className="flex min-h-52 items-center justify-center rounded-lg border border-dashed">
          <Button variant="outline" onClick={() => setArmed(true)}>
            Trigger a render error
          </Button>
        </div>
      )}
    </ErrorBoundary>
  );
}
