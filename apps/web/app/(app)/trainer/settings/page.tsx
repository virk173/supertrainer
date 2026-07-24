import { Settings } from "lucide-react";

import { TrainerPlaceholder } from "@/components/trainer-placeholder";

export const metadata = { title: "Settings — supertrainer" };

export default function TrainerSettingsPage() {
  return (
    <TrainerPlaceholder
      title="Settings"
      icon={<Settings />}
      emptyTitle="Settings coming soon"
      description="Org profile, branding, client tiers, and notification preferences will live here. Branding and tiers are editable today from onboarding."
    />
  );
}
