"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, ShieldAlert } from "lucide-react";

import { Badge } from "@supertrainer/ui/components/badge";
import { Button } from "@supertrainer/ui/components/button";
import { Input } from "@supertrainer/ui/components/input";
import { cn, focusRing } from "@supertrainer/ui/lib/utils";

import {
  cancelOrgDeletion,
  downloadExport,
  requestOrgDeletion,
  requestOrgExport,
  setMonthlyExport,
} from "@/app/(app)/trainer/settings/data/actions";

export interface ExportRow {
  id: string;
  status: string;
  sizeBytes: number | null;
  requestedAt: string;
  expiresAt: string | null;
  error: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  queued: "Building",
  running: "Building",
  ready: "Ready",
  failed: "Failed",
  expired: "Link expired",
};

function fileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function shortDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border bg-surface-raised p-5">
      <div className="mb-4 space-y-1">
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function DataRights({
  isOwner,
  monthly,
  graceDays,
  tables,
  exports,
  scheduledDeletion,
}: {
  isOwner: boolean;
  monthly: boolean;
  graceDays: number;
  tables: string[];
  exports: ExportRow[];
  scheduledDeletion: { id: string; graceUntil: string } | null;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [showTables, setShowTables] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState("");
  const [confirming, setConfirming] = React.useState(false);

  async function run(
    key: string,
    fn: () => Promise<{ ok: boolean; url?: string; message?: string }>,
    done?: string,
  ) {
    setPending(key);
    setNotice(null);
    const res = await fn();
    if (res.ok && res.url) {
      window.location.href = res.url;
      setPending(null);
      return;
    }
    setPending(null);
    if (res.ok) {
      if (done) setNotice(done);
      router.refresh();
    } else {
      setNotice(res.message ?? "Something went wrong.");
    }
  }

  return (
    <div className="space-y-6" data-testid="data-rights">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Data &amp; privacy</h1>
        <p className="text-sm text-muted-foreground">
          Everything in this workspace is yours. Take a copy any time, or ask us to erase it.
        </p>
      </div>

      {notice ? (
        <p className="rounded-md border bg-surface p-3 text-sm" role="status">
          {notice}
        </p>
      ) : null}

      {/* ── the archive ─────────────────────────────────────────────────────── */}
      <Panel
        title="Your archive"
        description="A ZIP of plain CSV files — one per table — plus a manifest with row counts. It opens in any spreadsheet, with or without us."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => run("export", requestOrgExport, "Your archive is ready.")}
            disabled={pending !== null}
          >
            {pending === "export" ? <Loader2 className="animate-spin" /> : <Download />}
            Export everything
          </Button>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className={cn("size-4 rounded-md border-input accent-primary", focusRing)}
              checked={monthly}
              disabled={pending !== null}
              onChange={(e) => {
                const next = e.target.checked;
                void run("monthly", () => setMonthlyExport(next));
              }}
            />
            Build one automatically each month
          </label>
        </div>

        {/* What actually leaves with you — the promise, itemised. */}
        <div className="mt-5 border-t pt-4">
          <button
            type="button"
            onClick={() => setShowTables((v) => !v)}
            aria-expanded={showTables}
            className={cn(
              "flex w-full items-center justify-between rounded-md text-left text-sm font-medium",
              focusRing,
            )}
          >
            <span>What&rsquo;s inside</span>
            <span className="metric text-xs text-muted-foreground">{tables.length} tables</span>
          </button>
          {showTables ? (
            <ul className="mt-3 grid grid-cols-2 gap-x-6 sm:grid-cols-3">
              {tables.map((t) => (
                <li
                  key={t}
                  className="border-b border-border/60 py-1.5 font-mono text-xs text-muted-foreground"
                >
                  {t}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {/* Recent archives */}
        <div className="mt-5 border-t pt-4">
          <p className="metric-label mb-3">Recent archives</p>
          {exports.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You haven&rsquo;t exported anything yet.
            </p>
          ) : (
            <ul className="divide-y">
              {exports.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1 text-sm">
                    {shortDateTime(e.requestedAt)}
                    <span className="metric ml-3 text-xs text-muted-foreground">
                      {fileSize(e.sizeBytes)}
                    </span>
                  </span>
                  <Badge variant={e.status === "failed" ? "warning" : e.status === "ready" ? "success" : "muted"}>
                    {STATUS_LABEL[e.status] ?? e.status}
                  </Badge>
                  {e.status === "ready" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending !== null}
                      onClick={() => run(`dl:${e.id}`, () => downloadExport(e.id))}
                    >
                      {pending === `dl:${e.id}` ? <Loader2 className="animate-spin" /> : null}
                      Download
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      {/* ── deletion ────────────────────────────────────────────────────────── */}
      <Panel
        title="Deleting this workspace"
        description={`We build a final archive, wait ${graceDays} days, then erase every row and file. You can cancel any time in that window.`}
      >
        {scheduledDeletion ? (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-danger bg-danger/10 p-4"
            role="status"
          >
            <span className="flex items-start gap-2 text-sm">
              <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger" />
              <span>
                Scheduled for {longDate(scheduledDeletion.graceUntil)} —{" "}
                <span className="metric">{daysUntil(scheduledDeletion.graceUntil)}</span> days left
                to change your mind.
              </span>
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pending !== null}
              onClick={() => run("cancel", cancelOrgDeletion, "The deletion is cancelled.")}
            >
              {pending === "cancel" ? <Loader2 className="animate-spin" /> : null}
              Cancel deletion
            </Button>
          </div>
        ) : !isOwner ? (
          <p className="text-sm text-muted-foreground">Only the workspace owner can delete it.</p>
        ) : confirming ? (
          <div className="space-y-3">
            <label htmlFor="confirm-delete" className="block text-sm">
              Type <span className="metric">DELETE</span> to schedule it.
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <Input
                id="confirm-delete"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="w-40"
                autoComplete="off"
              />
              <Button
                variant="destructive"
                disabled={pending !== null || confirmText.trim().toUpperCase() !== "DELETE"}
                onClick={() =>
                  run("delete", () => requestOrgDeletion(confirmText), "Deletion scheduled.")
                }
              >
                {pending === "delete" ? <Loader2 className="animate-spin" /> : null}
                Schedule deletion
              </Button>
              <Button
                variant="ghost"
                disabled={pending !== null}
                onClick={() => {
                  setConfirming(false);
                  setConfirmText("");
                }}
              >
                Keep my workspace
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" onClick={() => setConfirming(true)}>
            Request deletion
          </Button>
        )}
      </Panel>
    </div>
  );
}
