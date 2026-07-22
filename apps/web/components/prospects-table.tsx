"use client";

import * as React from "react";
import { Check, Copy, Loader2, UserPlus } from "lucide-react";

import { Badge } from "@supertrainer/ui/components/badge";
import { Button } from "@supertrainer/ui/components/button";

import { convertProspect } from "@/app/(app)/trainer/prospects/actions";

export interface ProspectRow {
  id: string;
  name: string;
  goal: string | null;
  dateLabel: string;
  status: "started" | "preview_shown" | "converted" | "expired";
  allergenCount: number;
  intentBand: "high" | "medium" | "low" | null;
  intentReason: string | null;
  previewPath: string | null;
  converted: boolean;
}

const STATUS_LABELS: Record<ProspectRow["status"], string> = {
  started: "Started",
  preview_shown: "Preview shown",
  converted: "Converted",
  expired: "Expired",
};

// Chrome stays achromatic; color is reserved for state. Converted = success;
// everything mid-funnel is neutral.
function statusVariant(status: ProspectRow["status"]) {
  if (status === "converted") return "success" as const;
  if (status === "preview_shown") return "secondary" as const;
  return "outline" as const;
}

function intentVariant(band: NonNullable<ProspectRow["intentBand"]>) {
  return band === "high" ? ("default" as const) : band === "medium" ? ("secondary" as const) : ("muted" as const);
}

function CopyButton({ path, label = "Copy preview link" }: { path: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      data-testid="copy-preview-link"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(`${window.location.origin}${path}`);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked — no-op */
        }
      }}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

function ConvertCell({ row }: { row: ProspectRow }) {
  const [state, setState] = React.useState<"idle" | "busy" | "done">(
    row.converted ? "done" : "idle",
  );
  const [joinLink, setJoinLink] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  if (state === "done" && !joinLink) {
    return <span className="text-xs text-muted-foreground">Converted</span>;
  }

  if (joinLink) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="copy-join-link"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(joinLink);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* no-op */
          }
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? "Copied invite" : "Copy invite link"}
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={state === "busy"}
        data-testid="convert-prospect"
        onClick={async () => {
          setState("busy");
          setError(null);
          const result = await convertProspect(row.id);
          if (result.ok && result.joinLink) {
            setJoinLink(result.joinLink);
            setState("done");
          } else {
            setState("idle");
            setError(result.message ?? "Couldn't convert this prospect.");
          }
        }}
      >
        {state === "busy" ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
        {state === "busy" ? "Converting…" : "Convert"}
      </Button>
      {error && (
        <span className="text-xs text-danger" role="alert" data-testid="convert-error">
          {error}
        </span>
      )}
    </div>
  );
}

export function ProspectsTable({ rows }: { rows: ProspectRow[] }) {
  return (
    // Wide table scrolls inside its own container so the page body never scrolls
    // horizontally (design rule).
    <div className="overflow-x-auto rounded-lg border bg-card" data-testid="prospects-table">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="px-4 py-3 font-medium">Prospect</th>
            <th className="px-4 py-3 font-medium">Goal</th>
            <th className="px-4 py-3 font-medium">Intent</th>
            <th className="px-4 py-3 font-medium">Allergens</th>
            <th className="px-4 py-3 font-medium">Stage</th>
            <th className="px-4 py-3 font-medium">Submitted</th>
            <th className="px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b last:border-0 align-top" data-testid="prospect-row">
              <td className="px-4 py-3 font-medium text-foreground">{row.name}</td>
              <td className="px-4 py-3 text-muted-foreground">{row.goal ?? "—"}</td>
              <td className="px-4 py-3">
                {row.intentBand ? (
                  <Badge variant={intentVariant(row.intentBand)} title={row.intentReason ?? undefined}>
                    {row.intentBand}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                {row.allergenCount > 0 ? (
                  <Badge variant="warning">
                    {row.allergenCount} allergen{row.allergenCount === 1 ? "" : "s"}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">None</span>
                )}
              </td>
              <td className="px-4 py-3">
                <Badge variant={statusVariant(row.status)}>{STATUS_LABELS[row.status]}</Badge>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{row.dateLabel}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  {row.previewPath && <CopyButton path={row.previewPath} />}
                  <ConvertCell row={row} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
