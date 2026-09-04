"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2 } from "lucide-react";

import { Badge } from "@supertrainer/ui/components/badge";
import { Button } from "@supertrainer/ui/components/button";

import {
  cancelMyDeletion,
  downloadMyExport,
  requestMyDeletion,
  requestMyExport,
} from "@/app/(app)/portal/me/actions";

interface Row {
  id: string;
  status: string;
  sizeBytes: number | null;
  requestedAt: string;
}

function fileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function YourData({
  graceDays,
  exports,
  scheduledDeletion,
}: {
  graceDays: number;
  exports: Row[];
  scheduledDeletion: { graceUntil: string } | null;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
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

  const latest = exports[0];

  return (
    <section className="rounded-md border bg-surface-raised p-5" data-testid="your-data">
      <div className="mb-4 space-y-1">
        <h2 className="text-sm font-medium">Your data</h2>
        <p className="text-sm text-muted-foreground">
          Every weigh-in, meal, workout, and message you&rsquo;ve logged here belongs to you. Take a
          copy whenever you want it.
        </p>
      </div>

      {notice ? (
        <p className="mb-4 rounded-md border bg-surface p-3 text-sm" role="status">
          {notice}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => run("export", requestMyExport, "Your copy is ready.")}
          disabled={pending !== null}
        >
          {pending === "export" ? <Loader2 className="animate-spin" /> : <Download />}
          Get a copy of my data
        </Button>
        {latest && latest.status === "ready" ? (
          <Button
            variant="outline"
            disabled={pending !== null}
            onClick={() => run(`dl:${latest.id}`, () => downloadMyExport(latest.id))}
          >
            {pending === `dl:${latest.id}` ? <Loader2 className="animate-spin" /> : null}
            Download ({fileSize(latest.sizeBytes)})
          </Button>
        ) : latest ? (
          <Badge variant="muted">{latest.status === "failed" ? "Didn’t finish" : "Preparing"}</Badge>
        ) : null}
      </div>

      <div className="mt-5 border-t pt-4">
        {scheduledDeletion ? (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-danger bg-danger/10 p-4"
            role="status"
          >
            <span className="text-sm">
              Your data is erased on {longDate(scheduledDeletion.graceUntil)}. Your coach has been
              told.
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pending !== null}
              onClick={() => run("cancel", cancelMyDeletion, "That request is cancelled.")}
            >
              {pending === "cancel" ? <Loader2 className="animate-spin" /> : null}
              Cancel the request
            </Button>
          </div>
        ) : confirming ? (
          <div className="space-y-3">
            <p className="text-sm">
              We&rsquo;ll tell your coach, wait {graceDays} days, then erase everything. You can
              cancel at any point in that window.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="destructive"
                disabled={pending !== null}
                onClick={() => run("delete", requestMyDeletion, "Your request is in.")}
              >
                {pending === "delete" ? <Loader2 className="animate-spin" /> : null}
                Delete my data
              </Button>
              <Button variant="ghost" disabled={pending !== null} onClick={() => setConfirming(false)}>
                Never mind
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" className="px-0 text-muted-foreground" onClick={() => setConfirming(true)}>
            Delete my data
          </Button>
        )}
      </div>
    </section>
  );
}
