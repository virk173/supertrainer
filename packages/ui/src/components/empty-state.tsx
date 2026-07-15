import * as React from "react";

import { cn } from "@supertrainer/ui/lib/utils";

/*
 * The screen a user sees before their data exists. An empty screen is an
 * invitation to act: say what belongs here and offer the first step.
 * Icon is a slot (React node) so packages/ui stays icon-library-agnostic.
 */
function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex min-h-52 flex-col items-center justify-center gap-1 rounded-lg border border-dashed p-8 text-center",
        className,
      )}
      {...props}
    >
      {icon ? (
        <div
          aria-hidden="true"
          className="mb-3 flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-5"
        >
          {icon}
        </div>
      ) : null}
      <h3 className="text-sm font-semibold">{title}</h3>
      {description ? (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export { EmptyState };
