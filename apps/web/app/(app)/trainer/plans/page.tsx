import { ClipboardList } from "lucide-react";

import { TrainerPlaceholder } from "@/components/trainer-placeholder";

export const metadata = { title: "Plans — supertrainer" };

export default function TrainerPlansPage() {
  return (
    <TrainerPlaceholder
      title="Plans"
      icon={<ClipboardList />}
      emptyTitle="Plan overview coming soon"
      description="A cross-client view of diet plans and splits with their review status lands with the dashboard build. Individual plan and split review already open from a client's queue item."
    />
  );
}
