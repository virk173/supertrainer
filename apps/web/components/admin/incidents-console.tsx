"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Badge } from "@supertrainer/ui/components/badge";
import { Button } from "@supertrainer/ui/components/button";
import { Input } from "@supertrainer/ui/components/input";

import { endIncident, saveIncident } from "@/app/admin/actions";

// Phase 9.3 — saying so beats letting people find out. A published incident
// renders a banner on the surfaces it names; maintenance mode additionally tells
// people that writes are paused, in the interface's voice, without the coach
// having to explain an outage they didn't cause.

type Severity = "info" | "warning" | "critical";
type Surface = "portal" | "dashboard" | "both";

interface Incident {
  id: string;
  title: string;
  body: string;
  severity: Severity;
  surface: Surface;
  maintenanceMode: boolean;
  published: boolean;
  startsAt: string;
  endsAt: string | null;
}

const SEVERITIES: Severity[] = ["info", "warning", "critical"];
const SURFACES: Surface[] = ["both", "portal", "dashboard"];

export function IncidentsConsole({ incidents }: { incidents: Incident[] }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState({
    title: "",
    body: "",
    severity: "info" as Severity,
    surface: "both" as Surface,
    maintenanceMode: false,
  });

  async function run(tag: string, fn: () => Promise<{ ok: boolean; message?: string }>, done: string) {
    setPending(tag);
    setNotice(null);
    const res = await fn();
    setPending(null);
    setNotice(res.ok ? done : (res.message ?? "That didn’t work."));
    if (res.ok) router.refresh();
  }

  const live = incidents.filter((i) => i.published);

  return (
    <div className="space-y-6" data-testid="admin-incidents">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Incidents</h1>
        <p className="text-sm text-muted-foreground">
          A published incident shows a banner to everyone on that surface.
        </p>
      </div>

      {notice ? (
        <p className="rounded-md border bg-surface p-3 text-sm" role="status">
          {notice}
        </p>
      ) : null}

      <section className="rounded-md border bg-surface-raised p-5">
        <p className="metric-label mb-4">Post an incident</p>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="inc-title" className="block text-sm font-medium">Title</label>
            <Input
              id="inc-title"
              value={draft.title}
              placeholder="Push notifications are delayed"
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="inc-body" className="block text-sm font-medium">What people should know</label>
            <Input
              id="inc-body"
              value={draft.body}
              placeholder="Reminders may arrive late. Logging still works."
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            />
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <label htmlFor="inc-severity" className="block text-sm font-medium">Severity</label>
              <select
                id="inc-severity"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={draft.severity}
                onChange={(e) => setDraft({ ...draft, severity: e.target.value as Severity })}
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="inc-surface" className="block text-sm font-medium">Shown to</label>
              <select
                id="inc-surface"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={draft.surface}
                onChange={(e) => setDraft({ ...draft, surface: e.target.value as Surface })}
              >
                {SURFACES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                className="size-4 rounded-md accent-primary"
                checked={draft.maintenanceMode}
                onChange={(e) => setDraft({ ...draft, maintenanceMode: e.target.checked })}
              />
              Maintenance mode
            </label>
            <Button
              disabled={pending !== null}
              onClick={() =>
                run("post", () => saveIncident({ ...draft, published: true }), "Incident published.")
              }
            >
              {pending === "post" ? <Loader2 className="animate-spin" /> : null}
              Publish
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-md border bg-surface-raised p-5">
        <p className="metric-label mb-4">{live.length > 0 ? "Live now" : "History"}</p>
        {incidents.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing has gone wrong yet.</p>
        ) : (
          <ul className="divide-y">
            {incidents.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 py-3" data-testid="incident-row">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{i.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {new Date(i.startsAt).toLocaleString()} · {i.surface}
                    {i.maintenanceMode ? " · maintenance" : ""}
                  </span>
                </span>
                <Badge
                  variant={
                    i.severity === "critical" ? "warning" : i.severity === "warning" ? "warning" : "muted"
                  }
                >
                  {i.severity}
                </Badge>
                <Badge variant={i.published ? "success" : "outline"}>
                  {i.published ? "Live" : "Ended"}
                </Badge>
                {i.published ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending !== null}
                    onClick={() => run(`end:${i.id}`, () => endIncident(i.id), "Incident ended.")}
                  >
                    End
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
