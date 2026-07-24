import { Inbox } from "lucide-react";

import { TrainerPlaceholder } from "@/components/trainer-placeholder";

export const metadata = { title: "Inbox — supertrainer" };

export default function TrainerInboxPage() {
  return (
    <TrainerPlaceholder
      title="Inbox"
      icon={<Inbox />}
      emptyTitle="Your client inboxes land here"
      description="The three-in-one per-client view — conversation thread, drafted replies, and to-do tracker — arrives in Phase 7.4. Until then, open a client to see their thread."
    />
  );
}
