import { Sun } from "lucide-react";

import { EmptyState } from "@supertrainer/ui/components/empty-state";

export const metadata = { title: "Today — supertrainer" };

export default function PortalHomePage() {
  return (
    <div className="space-y-4">
      <h1
        className="text-xl font-semibold tracking-tight"
        data-testid="portal-home"
      >
        Today
      </h1>
      <EmptyState
        icon={<Sun />}
        title="Nothing to log yet"
        description="Your trainer is setting things up. Your plan and daily check-ins will appear here."
      />
    </div>
  );
}
