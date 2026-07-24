"use client";

import * as React from "react";
import { Loader2, Lock } from "lucide-react";

import { Button } from "@supertrainer/ui/components/button";

import { startTierCheckout } from "@/app/(app)/portal/membership/actions";

export function SubscribeButton({ tierId, label }: { tierId: string; label: string }) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function subscribe() {
    setPending(true);
    setError(null);
    const res = await startTierCheckout(tierId);
    if (res.ok && res.url) {
      window.location.href = res.url;
      return;
    }
    setPending(false);
    setError(res.message ?? "Couldn’t start checkout.");
  }

  return (
    <div className="space-y-2">
      <Button size="lg" onClick={subscribe} disabled={pending} data-testid="subscribe">
        {pending ? <Loader2 className="animate-spin" /> : <Lock />}
        {label}
      </Button>
      {error ? (
        <p className="text-sm text-warning-text" role="status" aria-live="polite">
          {error}
        </p>
      ) : null}
    </div>
  );
}
