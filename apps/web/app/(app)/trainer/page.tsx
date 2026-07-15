import { Users } from "lucide-react";

import { EmptyState } from "@supertrainer/ui/components/empty-state";

export const metadata = { title: "Home — supertrainer" };

export default function TrainerHomePage() {
  return (
    <div className="space-y-6">
      <h1
        className="text-2xl font-semibold tracking-tight"
        data-testid="trainer-home"
      >
        Home
      </h1>
      <EmptyState
        icon={<Users />}
        title="No clients yet"
        description="Invite your first client to see their adherence, plans, and messages here."
      />
    </div>
  );
}
