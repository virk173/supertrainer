import { BarChart3 } from "lucide-react";

import { TrainerPlaceholder } from "@/components/trainer-placeholder";

export const metadata = { title: "Analytics — supertrainer" };

export default function TrainerAnalyticsPage() {
  return (
    <TrainerPlaceholder
      title="Analytics"
      icon={<BarChart3 />}
      emptyTitle="Business analytics coming soon"
      description="Revenue, roster health, the churn radar, and your AI zero-edit rate arrive in Phase 7.6 — each chart wired to real queries as the data lands."
    />
  );
}
