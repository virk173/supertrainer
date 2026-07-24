"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Badge } from "@supertrainer/ui/components/badge";
import { Button } from "@supertrainer/ui/components/button";
import { EmptyState } from "@supertrainer/ui/components/empty-state";

import { beginCutover, enrollPlatform } from "@/app/(app)/trainer/settings/payments/cutover/actions";
import type { CutoverProgress, CutoverState } from "@/lib/payments/cutover-state";

interface CutoverClient {
  clientId: string;
  name: string;
  state: CutoverState;
  tierId: string | null;
}
interface TierOption {
  id: string;
  name: string;
}

const STATE_LABEL: Record<CutoverState, string> = {
  not_started: "Not started",
  in_grace: "In grace",
  captured: "Captured",
  expired: "Uncaptured",
};
const STATE_TONE: Record<CutoverState, "success" | "warning" | "muted"> = {
  not_started: "muted",
  in_grace: "warning",
  captured: "success",
  expired: "warning",
};

const selectClass =
  "h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-surface-raised p-4">
      <p className="metric-label">{label}</p>
      <p className="metric mt-1 text-2xl leading-none">{value}</p>
    </div>
  );
}

export function CutoverPanel({
  clients,
  progress,
  tiers,
  platformEnrolled,
}: {
  clients: CutoverClient[];
  progress: CutoverProgress;
  tiers: TierOption[];
  platformEnrolled: boolean;
}) {
  const [pending, setPending] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [tierByClient, setTierByClient] = React.useState<Record<string, string>>({});

  async function start(clientId: string) {
    const tierId = tierByClient[clientId] ?? tiers[0]?.id;
    if (!tierId) return;
    setPending(clientId);
    setNotice(null);
    const res = await beginCutover(clientId, tierId);
    setPending(null);
    setNotice(res.ok ? "Cutover started — the client was invited to set up payment." : res.message ?? "Couldn’t start.");
  }

  async function enroll() {
    setPending("enroll");
    setNotice(null);
    const res = await enrollPlatform();
    setPending(null);
    setNotice(res.ok ? "You’re enrolled in the platform plan." : res.message ?? "Couldn’t enroll.");
  }

  const pendingClients = clients.filter((c) => c.state === "not_started");

  return (
    <div className="space-y-4" data-testid="cutover-panel">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Captured" value={progress.captured} />
        <Tile label="In grace" value={progress.inGrace} />
        <Tile label="Not started" value={progress.notStarted} />
        <Tile label="Uncaptured" value={progress.expired} />
      </div>

      {!platformEnrolled ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-surface-raised p-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">Your platform plan</p>
            <p className="text-sm text-muted-foreground">
              Enroll in the base plan to start billing. Founder pricing is honored for life.
            </p>
          </div>
          <Button onClick={enroll} disabled={!!pending}>
            {pending === "enroll" ? <Loader2 className="animate-spin" /> : null}
            Enroll in platform plan
          </Button>
        </div>
      ) : null}

      <section className="rounded-md border bg-surface-raised p-5">
        <p className="metric-label mb-4">Clients to migrate</p>
        {clients.length === 0 ? (
          <EmptyState
            title="Everyone’s migrated"
            description="No manually-approved clients are waiting on cutover. Nice work."
          />
        ) : pendingClients.length === 0 ? (
          <ul className="space-y-2">
            {clients.map((c) => (
              <li key={c.clientId} className="flex items-center justify-between gap-3 rounded-md border p-3">
                <span className="text-sm font-medium">{c.name}</span>
                <Badge variant={STATE_TONE[c.state]}>{STATE_LABEL[c.state]}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="space-y-2">
            {clients.map((c) => (
              <li key={c.clientId} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <span className="min-w-0 flex-1 text-sm font-medium">{c.name}</span>
                {c.state === "not_started" ? (
                  <div className="flex items-center gap-2">
                    <label className="sr-only" htmlFor={`tier-${c.clientId}`}>
                      Tier for {c.name}
                    </label>
                    <select
                      id={`tier-${c.clientId}`}
                      className={selectClass}
                      value={tierByClient[c.clientId] ?? tiers[0]?.id ?? ""}
                      onChange={(e) => setTierByClient((m) => ({ ...m, [c.clientId]: e.target.value }))}
                    >
                      {tiers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <Button size="sm" onClick={() => start(c.clientId)} disabled={!!pending || tiers.length === 0}>
                      {pending === c.clientId ? <Loader2 className="animate-spin" /> : null}
                      Start cutover
                    </Button>
                  </div>
                ) : (
                  <Badge variant={STATE_TONE[c.state]}>{STATE_LABEL[c.state]}</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
        {notice}
      </p>
    </div>
  );
}
