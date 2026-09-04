"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@supertrainer/ui/components/button";
import { Input } from "@supertrainer/ui/components/input";

import { upsertFlag } from "@/app/admin/actions";

// Phase 9.3 — every rollout from here on goes through a flag. The ramp is
// deterministic per org, so a trainer never sees a feature flicker in and out
// between page loads.

interface FlagRow {
  key: string;
  description: string;
  enabledDefault: boolean;
  rolloutPercent: number;
  overrides: number;
}

export function FlagsConsole({ flags }: { flags: FlagRow[] }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState({ key: "", description: "", rollout: "0" });

  async function save(input: {
    key: string;
    description: string;
    enabledDefault: boolean;
    rolloutPercent: number;
  }, tag: string) {
    setPending(tag);
    setNotice(null);
    const res = await upsertFlag(input);
    setPending(null);
    setNotice(res.ok ? "Saved." : (res.message ?? "That didn’t work."));
    if (res.ok) router.refresh();
  }

  return (
    <div className="space-y-6" data-testid="admin-flags">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Flags</h1>
        <p className="text-sm text-muted-foreground">
          Ramp a feature by percentage, or force it on for one org from that org&rsquo;s page.
        </p>
      </div>

      {notice ? (
        <p className="rounded-md border bg-surface p-3 text-sm" role="status">
          {notice}
        </p>
      ) : null}

      <section className="rounded-md border bg-surface-raised p-5">
        <p className="metric-label mb-4">New flag</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <label htmlFor="flag-key" className="block text-sm font-medium">Key</label>
            <Input
              id="flag-key"
              className="w-44 font-mono"
              value={draft.key}
              placeholder="wearables"
              onChange={(e) => setDraft({ ...draft, key: e.target.value })}
            />
          </div>
          <div className="min-w-[14rem] flex-1 space-y-1.5">
            <label htmlFor="flag-desc" className="block text-sm font-medium">What it does</label>
            <Input
              id="flag-desc"
              value={draft.description}
              placeholder="HealthKit sync in the mobile shell"
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="flag-rollout" className="block text-sm font-medium">Ramp %</label>
            <Input
              id="flag-rollout"
              inputMode="numeric"
              className="w-20"
              value={draft.rollout}
              onChange={(e) => setDraft({ ...draft, rollout: e.target.value })}
            />
          </div>
          <Button
            disabled={pending !== null}
            onClick={() =>
              save(
                {
                  key: draft.key,
                  description: draft.description,
                  enabledDefault: false,
                  rolloutPercent: Number(draft.rollout || 0),
                },
                "new",
              )
            }
          >
            {pending === "new" ? <Loader2 className="animate-spin" /> : null}
            Create flag
          </Button>
        </div>
      </section>

      <section className="rounded-md border bg-surface-raised p-5">
        <p className="metric-label mb-4">Flags</p>
        {flags.length === 0 ? (
          <p className="text-sm text-muted-foreground">No flags yet.</p>
        ) : (
          <ul className="divide-y">
            {flags.map((f) => (
              <li key={f.key} className="flex flex-wrap items-center gap-3 py-3" data-testid="flag-row">
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-xs">{f.key}</span>
                  <span className="block text-xs text-muted-foreground">
                    {f.description || "No description"} · {f.overrides} org override
                    {f.overrides === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="metric text-sm tabular-nums">{f.rolloutPercent}%</span>
                <span className="flex gap-1">
                  {[0, 25, 50, 100].map((pct) => (
                    <Button
                      key={pct}
                      variant="outline"
                      size="sm"
                      disabled={pending !== null || f.rolloutPercent === pct}
                      onClick={() =>
                        save(
                          {
                            key: f.key,
                            description: f.description,
                            enabledDefault: f.enabledDefault,
                            rolloutPercent: pct,
                          },
                          `${f.key}:${pct}`,
                        )
                      }
                    >
                      {pct}%
                    </Button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
