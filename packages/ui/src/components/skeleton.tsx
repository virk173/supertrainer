import * as React from "react";

import { cn } from "@supertrainer/ui/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

/* Ready-made loading shapes so screens don't hand-roll pulse layouts. */

function SkeletonText({
  lines = 3,
  className,
  ...props
}: React.ComponentProps<"div"> & { lines?: number }) {
  return (
    <div
      data-slot="skeleton-text"
      className={cn("space-y-2", className)}
      {...props}
    >
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={cn("h-4", i === lines - 1 ? "w-3/5" : "w-full")}
        />
      ))}
    </div>
  );
}

function SkeletonCard({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton-card"
      className={cn("rounded-lg border bg-card p-6", className)}
      {...props}
    >
      <Skeleton className="mb-4 h-5 w-2/5" />
      <SkeletonText />
    </div>
  );
}

export { Skeleton, SkeletonText, SkeletonCard };
