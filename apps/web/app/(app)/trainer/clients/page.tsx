import { Users } from "lucide-react";

import { TrainerPlaceholder } from "@/components/trainer-placeholder";

export const metadata = { title: "Clients — supertrainer" };

export default function TrainerClientsPage() {
  return (
    <TrainerPlaceholder
      title="Clients"
      icon={<Users />}
      emptyTitle="The roster is on its way"
      description="A sortable, filterable roster — adherence bands, weight trend, renewal windows, saved views — arrives in Phase 7.5. Invite clients from Prospects in the meantime."
    />
  );
}
