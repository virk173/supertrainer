"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@supertrainer/ui/components/button";

// Phase 9.4 — the client's friend link. One card, no nagging, no reward
// dangled at the client: they are recommending their coach, and turning that
// into a transaction would cheapen it. The trainer chose to show this at all.

export function BringAFriend({ link, coachName }: { link: string; coachName: string }) {
  const [copied, setCopied] = React.useState(false);

  return (
    <section className="rounded-md border bg-surface-raised p-5" data-testid="bring-a-friend">
      <div className="mb-4 space-y-1">
        <h2 className="text-sm font-medium">Know someone who&rsquo;d like this?</h2>
        <p className="text-sm text-muted-foreground">
          Send them your link and they&rsquo;ll land on {coachName}&rsquo;s page with a plan
          preview, same as you did.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <code className="min-w-0 flex-1 truncate rounded-md border bg-surface px-3 py-2 font-mono text-xs">
          {link}
        </code>
        <Button
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // clipboard blocked — the link is on screen to copy by hand
            }
          }}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </section>
  );
}
