import * as React from "react";

import { EmptyState } from "@supertrainer/ui/components/empty-state";

// A designed placeholder for a nav destination whose full surface lands in a
// later Phase 7 sub-phase — so the shell never links to a dead page. Each states
// what will live here and points to what already works, in interface voice.
export function TrainerPlaceholder({
  title,
  icon,
  emptyTitle,
  description,
}: {
  title: string;
  icon: React.ReactNode;
  emptyTitle: string;
  description: string;
}) {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <EmptyState icon={icon} title={emptyTitle} description={description} />
    </div>
  );
}
