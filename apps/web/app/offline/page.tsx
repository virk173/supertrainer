import { CloudOff } from "lucide-react";

import { EmptyState } from "@supertrainer/ui/components/empty-state";

export const metadata = { title: "Offline" };

// Cached by the service worker at install and served when a navigation fails
// (Phase 2.4). Kept static and dependency-free so it always renders offline.
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md items-center justify-center px-6">
      <EmptyState
        icon={<CloudOff />}
        title="You're offline"
        description="Your plan will be here as soon as you're back on a connection. Anything you logged is saved on this device."
      />
    </main>
  );
}
