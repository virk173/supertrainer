"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, Loader2 } from "lucide-react";

import { Badge } from "@supertrainer/ui/components/badge";
import { Button } from "@supertrainer/ui/components/button";
import { Input } from "@supertrainer/ui/components/input";
import { cn } from "@supertrainer/ui/lib/utils";

import {
  endOrgView,
  regenerateExport,
  replayWebhook,
  resendInvite,
  setFlagOverride,
  setOrgBudget,
  setOrgThrottle,
  startOrgView,
} from "@/app/admin/actions";
import { BudgetMeter, Percent, Stat } from "@/components/admin/primitives";

// Phase 9.3 — one org, everything support needs, and nothing it doesn't.
//
// Deliberately absent: message bodies, health flags, plan contents. Support can
// see SHAPE (how many clients, which are stuck, what failed) without reading a
// client's private conversation with their coach. Looking at all of it is
// recorded either way, and the trainer can read that record in their own export.

interface Health {
  orgId: string;
  name: string;
  clientCount: number;
  clientMrrCents: number;
  platformMrrCents: number;
  aiSpend: string;
  aiSpendMicros: number;
  capMicros: number;
  budgetDollars: number | null;
  budget: "ok" | "near" | "over";
  throttled: boolean;
  margin: string;
  marginNegative: boolean;
  zeroEditRate: number | null;
  pushSuccessRate: number | null;
}

interface ClientRow {
  id: string;
  name: string;
  status: string;
  isDemo: boolean;
}

interface FlagRow {
  key: string;
  description: string;
  enabledDefault: boolean;
  rolloutPercent: number;
  override: boolean | null;
}

interface ViewRow {
  id: string;
  reason: string;
  startedAt: string;
  endedAt: string | null;
}

interface EventRow {
  id: string;
  stripeEventId: string;
  type: string;
  receivedAt: string;
}

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border bg-surface-raised p-5">
      <p className="metric-label mb-4">{title}</p>
      {children}
    </section>
  );
}

export function OrgConsole({
  health,
  clients,
  flags,
  views,
  unprocessedEvents,
}: {
  health: Health;
  clients: ClientRow[];
  flags: FlagRow[];
  views: ViewRow[];
  unprocessedEvents: EventRow[];
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [budget, setBudget] = React.useState(
    health.budgetDollars === null ? "" : String(health.budgetDollars),
  );
  const [reason, setReason] = React.useState("");

  const openView = views.find((v) => !v.endedAt) ?? null;

  async function run(
    key: string,
    fn: () => Promise<{ ok: boolean; message?: string; data?: unknown }>,
    done?: string,
  ) {
    setPending(key);
    setNotice(null);
    const res = await fn();
    setPending(null);
    setNotice(res.ok ? (res.message ?? done ?? null) : (res.message ?? "That didn’t work."));
    if (res.ok) router.refresh();
  }

  return (
    <div className="space-y-6" data-testid="admin-org">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{health.name}</h1>
        <p className="text-sm text-muted-foreground">
          {health.clientCount} active clients · they bill {money(health.clientMrrCents)}/mo · they
          pay us {money(health.platformMrrCents)}/mo
        </p>
      </div>

      {openView ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning bg-warning/10 p-4"
          role="status"
          data-testid="view-banner"
        >
          <span className="flex items-center gap-2 text-sm">
            <Eye aria-hidden="true" className="size-4 shrink-0" />
            Read-only view open — {openView.reason}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={pending !== null}
            onClick={() => run("endview", () => endOrgView(openView.id), "View closed.")}
          >
            Close view
          </Button>
        </div>
      ) : null}

      {notice ? (
        <p className="rounded-md border bg-surface p-3 text-sm" role="status">
          {notice}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="AI spend (30d)" value={health.aiSpend} />
        <Stat
          label="Margin"
          value={health.margin}
          tone={health.marginNegative ? "danger" : undefined}
        />
        <div className="rounded-md border bg-surface-raised p-4">
          <p className="metric-label">Zero-edit</p>
          <p className="mt-1"><Percent value={health.zeroEditRate} /></p>
        </div>
        <div className="rounded-md border bg-surface-raised p-4">
          <p className="metric-label">Push delivered</p>
          <p className="mt-1"><Percent value={health.pushSuccessRate} /></p>
        </div>
      </div>

      <Panel title="AI budget">
        <div className="space-y-4">
          <BudgetMeter
            spendMicros={health.aiSpendMicros}
            capMicros={health.capMicros}
            state={health.budget}
          />
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label htmlFor="budget" className="block text-sm font-medium">
                Monthly cap (dollars)
              </label>
              <Input
                id="budget"
                inputMode="decimal"
                className="w-32"
                value={budget}
                placeholder="25"
                onChange={(e) => setBudget(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              disabled={pending !== null}
              onClick={() =>
                run(
                  "budget",
                  () => setOrgBudget(health.orgId, budget.trim() === "" ? null : Number(budget)),
                  "Cap saved.",
                )
              }
            >
              {pending === "budget" ? <Loader2 className="animate-spin" /> : null}
              Save cap
            </Button>
            <Button
              variant={health.throttled ? "outline" : "secondary"}
              disabled={pending !== null}
              onClick={() =>
                run(
                  "throttle",
                  () => setOrgThrottle(health.orgId, !health.throttled),
                  health.throttled ? "Scheduled AI resumed." : "Scheduled AI stood down.",
                )
              }
            >
              {pending === "throttle" ? <Loader2 className="animate-spin" /> : null}
              {health.throttled ? "Resume scheduled AI" : "Stand down scheduled AI"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Standing down pauses scheduled generation (monthly plans). Replies, meal parsing, and
            anything a person is waiting for keep running.
          </p>
        </div>
      </Panel>

      <Panel title="Feature flags">
        {flags.length === 0 ? (
          <p className="text-sm text-muted-foreground">No flags defined yet.</p>
        ) : (
          <ul className="divide-y">
            {flags.map((f) => (
              <li key={f.key} className="flex flex-wrap items-center gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-xs">{f.key}</span>
                  <span className="block text-xs text-muted-foreground">
                    {f.description || "No description"} · default {f.enabledDefault ? "on" : "off"} ·{" "}
                    {f.rolloutPercent}% ramp
                  </span>
                </span>
                <Badge variant={f.override === null ? "outline" : f.override ? "success" : "muted"}>
                  {f.override === null ? "Follows ramp" : f.override ? "Forced on" : "Forced off"}
                </Badge>
                <span className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending !== null}
                    onClick={() => run(`on:${f.key}`, () => setFlagOverride(f.key, health.orgId, true))}
                  >
                    On
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending !== null}
                    onClick={() => run(`off:${f.key}`, () => setFlagOverride(f.key, health.orgId, false))}
                  >
                    Off
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending !== null || f.override === null}
                    onClick={() => run(`clear:${f.key}`, () => setFlagOverride(f.key, health.orgId, null))}
                  >
                    Clear
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Support">
        <div className="space-y-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[16rem] flex-1 space-y-1.5">
              <label htmlFor="view-reason" className="block text-sm font-medium">
                Why do you need to look?
              </label>
              <Input
                id="view-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ticket 412 — plans not delivering"
                autoComplete="off"
              />
            </div>
            <Button
              variant="outline"
              disabled={pending !== null || Boolean(openView)}
              onClick={() => run("view", () => startOrgView(health.orgId, reason), "View opened.")}
            >
              {pending === "view" ? <Loader2 className="animate-spin" /> : <Eye />}
              Open read-only view
            </Button>
            <Button
              variant="outline"
              disabled={pending !== null}
              onClick={() => run("export", () => regenerateExport(health.orgId), "Archive rebuilt.")}
            >
              {pending === "export" ? <Loader2 className="animate-spin" /> : null}
              Rebuild their archive
            </Button>
          </div>

          <div>
            <p className="metric-label mb-2">Clients</p>
            <ul className="divide-y">
              {clients.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 text-sm">
                    {c.name}
                    {c.isDemo ? <span className="ml-2 text-xs text-muted-foreground">demo</span> : null}
                  </span>
                  <Badge variant={c.status === "active" ? "success" : "muted"}>{c.status}</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending !== null}
                    onClick={() => run(`invite:${c.id}`, () => resendInvite(c.id), "New invite issued.")}
                  >
                    Reissue invite
                  </Button>
                </li>
              ))}
              {clients.length === 0 ? (
                <li className="py-2 text-sm text-muted-foreground">No clients yet.</li>
              ) : null}
            </ul>
          </div>

          <div>
            <p className="metric-label mb-2">Unprocessed Stripe events (platform-wide)</p>
            {unprocessedEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing stuck.</p>
            ) : (
              <ul className="divide-y">
                {unprocessedEvents.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-3 py-2">
                    <span className="min-w-0 flex-1 font-mono text-xs">{e.type}</span>
                    <span className="text-xs text-muted-foreground">{e.stripeEventId}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending !== null}
                      onClick={() => run(`replay:${e.id}`, () => replayWebhook(e.id))}
                    >
                      {pending === `replay:${e.id}` ? <Loader2 className="animate-spin" /> : null}
                      Replay
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {views.length > 0 ? (
            <div>
              <p className="metric-label mb-2">Recent views of this org</p>
              <ul className="divide-y text-xs text-muted-foreground">
                {views.map((v) => (
                  <li key={v.id} className={cn("py-2", !v.endedAt && "text-foreground")}>
                    {new Date(v.startedAt).toLocaleString()} — {v.reason}
                    {v.endedAt ? "" : " (open)"}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
