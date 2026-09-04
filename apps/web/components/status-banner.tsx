import { AlertTriangle, Info } from "lucide-react";

import { cn } from "@supertrainer/ui/lib/utils";

import { liveIncident } from "@/lib/admin/incidents";

// Phase 9.3 — when something is wrong, the product says so. The banner speaks in
// the interface's voice and never blames or apologises on the coach's behalf;
// a client should never have to ask their trainer why the app is quiet.

export async function StatusBanner({ surface }: { surface: "portal" | "dashboard" }) {
  const incident = await liveIncident(surface);
  if (!incident) return null;

  const serious = incident.severity !== "info";
  const Icon = serious ? AlertTriangle : Info;

  return (
    <div
      role="status"
      data-testid="status-banner"
      className={cn(
        "flex items-start gap-2 border-b px-4 py-2.5 text-sm",
        serious ? "border-warning bg-warning/10" : "bg-surface",
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">
        <span className="font-medium">{incident.title}</span>
        {incident.body ? <span className="ml-2 text-muted-foreground">{incident.body}</span> : null}
        {incident.maintenanceMode ? (
          <span className="ml-2 text-muted-foreground">Changes you make may not save yet.</span>
        ) : null}
      </span>
    </div>
  );
}
