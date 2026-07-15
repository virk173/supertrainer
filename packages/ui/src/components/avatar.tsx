import * as React from "react";

import { cn } from "@supertrainer/ui/lib/utils";

/* Initials avatar — image support arrives when profiles get photos. */
function Avatar({
  name,
  className,
  ...props
}: React.ComponentProps<"span"> & { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

  return (
    <span
      data-slot="avatar"
      role="img"
      aria-label={name}
      className={cn(
        "flex size-8 shrink-0 select-none items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground",
        className,
      )}
      {...props}
    >
      {initials || "?"}
    </span>
  );
}

export { Avatar };
