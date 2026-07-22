"use client";

import * as React from "react";
import Link from "next/link";
import {
  Check,
  FileText,
  Loader2,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

import { Button } from "@supertrainer/ui/components/button";
import { Badge } from "@supertrainer/ui/components/badge";
import { Input } from "@supertrainer/ui/components/input";
import { Label } from "@supertrainer/ui/components/label";
import { Progress } from "@supertrainer/ui/components/progress";
import { cn } from "@supertrainer/ui/lib/utils";
import { createSupabaseBrowserClient } from "@supertrainer/db/browser";

import {
  confirmStyleProfile,
  ingestUploads,
  type StyleDraft,
} from "@/app/onboarding/style/actions";
import { humanizeField, styleCoverage } from "@/lib/style/coverage";
import type { StyleDomain } from "@/lib/style/profiles";

const ACCEPTED = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "text/plain",
  "text/markdown",
];
const MAX_FILES = 20;

const DOMAIN_META: Record<StyleDomain, { title: string; lead: string }> = {
  diet: { title: "Your nutrition style", lead: "Here's how I read the way you program food:" },
  training: { title: "Your training style", lead: "Here's how I read the way you program lifting:" },
  voice: { title: "Your coaching voice", lead: "Here's how I read the way you talk to clients:" },
};

export function StyleIngestion({
  orgId,
  initialDrafts,
  confirmedDomains,
  confirmedProfiles,
}: {
  orgId: string;
  initialDrafts: StyleDraft[];
  confirmedDomains: StyleDomain[];
  confirmedProfiles: { domain: StyleDomain; profile: Record<string, unknown> }[];
}) {
  const [files, setFiles] = React.useState<File[]>([]);
  const [drafts, setDrafts] = React.useState<StyleDraft[]>(initialDrafts);
  const [confirmed, setConfirmed] = React.useState<Set<StyleDomain>>(
    new Set(confirmedDomains),
  );
  const [phase, setPhase] = React.useState<
    "upload" | "processing" | "confirm" | "summary"
  >(
    initialDrafts.length > 0
      ? "confirm"
      : confirmedDomains.length > 0
        ? "summary"
        : "upload",
  );
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    const incoming = Array.from(list).filter((f) => ACCEPTED.includes(f.type));
    setFiles((prev) => [...prev, ...incoming].slice(0, MAX_FILES));
  }

  async function analyze() {
    if (files.length === 0) return;
    setPending(true);
    setError(null);
    setPhase("processing");
    try {
      const supabase = createSupabaseBrowserClient();
      const uploaded: { path: string; mimeType: string }[] = [];
      for (const file of files) {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
        const path = `${orgId}/${crypto.randomUUID().slice(0, 8)}-${safe}`;
        const { error: upErr } = await supabase.storage
          .from("ingestion")
          .upload(path, file, { contentType: file.type, upsert: true });
        if (upErr) throw new Error(upErr.message);
        uploaded.push({ path, mimeType: file.type });
      }

      const result = await ingestUploads(uploaded);
      if (!result.ok || !result.drafts) {
        setError(result.message ?? "Ingestion failed.");
        setPhase("upload");
        return;
      }
      setDrafts(result.drafts);
      setConfirmed(new Set());
      setPhase("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setPhase("upload");
    } finally {
      setPending(false);
    }
  }

  function updateField(domain: StyleDomain, key: string, value: unknown) {
    setDrafts((prev) =>
      prev.map((d) =>
        d.domain === domain
          ? { ...d, profile: { ...d.profile, [key]: value } }
          : d,
      ),
    );
  }

  async function confirm(draft: StyleDraft) {
    setPending(true);
    setError(null);
    const result = await confirmStyleProfile(draft.domain, draft.profile);
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? "Couldn't save.");
      return;
    }
    const next = new Set(confirmed).add(draft.domain);
    setConfirmed(next);
    // Once every draft is confirmed, flip to the strength summary (PO-2), which
    // keeps a persistent "add more examples" affordance to re-run extraction.
    if (drafts.every((d) => next.has(d.domain))) setPhase("summary");
  }

  function addMoreExamples() {
    setPhase("upload");
    setFiles([]);
    setError(null);
  }

  if (phase === "summary") {
    // Meters from the just-confirmed drafts if we have them, else the confirmed
    // profiles the page loaded with.
    const summaryProfiles =
      drafts.length > 0
        ? drafts.map((d) => ({ domain: d.domain, profile: d.profile }))
        : confirmedProfiles;
    return (
      <div className="space-y-6" data-testid="style-confirmed">
        <div className="flex flex-col items-center gap-3 rounded-lg border bg-surface p-8 text-center">
          <Sparkles aria-hidden="true" className="size-8 text-success" />
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">
              Your style is locked in
            </h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Every draft the AI writes from here on will sound like you.
            </p>
          </div>
        </div>

        {summaryProfiles.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium">How well the AI knows your style</h3>
            {summaryProfiles.map((p) => (
              <div
                key={p.domain}
                data-testid={`style-summary-${p.domain}`}
                className="rounded-lg border bg-card p-4"
              >
                <p className="mb-2 text-sm font-medium">{DOMAIN_META[p.domain].title}</p>
                <StyleMeter profile={p.profile} />
              </div>
            ))}
          </div>
        )}

        <div className="rounded-lg border border-dashed bg-surface p-4" data-testid="sharpen-affordance">
          <p className="text-sm font-medium">Add more examples to sharpen your AI</p>
          <p className="mt-1 text-xs text-muted-foreground">
            More plans and check-ins make every draft sound more like you. New
            uploads are combined with what you&apos;ve already added.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={addMoreExamples}
            data-testid="add-more-examples"
          >
            <Upload aria-hidden="true" className="size-4" /> Add more examples
          </Button>
        </div>

        <Button asChild variant="ghost">
          <Link href="/onboarding">Back to checklist</Link>
        </Button>
      </div>
    );
  }

  if (phase === "processing") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border bg-surface p-10 text-center">
        <Loader2 aria-hidden="true" className="size-8 animate-spin text-muted-foreground" />
        <p className="text-sm font-medium">Reading your materials and learning your style…</p>
        <p className="text-xs text-muted-foreground">This takes a moment — the AI is studying how you coach.</p>
      </div>
    );
  }

  if (phase === "confirm") {
    return (
      <div className="space-y-6" data-testid="style-confirm">
        <p className="text-sm text-muted-foreground">
          Review each one and fix anything I got wrong — your edits teach me.
        </p>
        {drafts.map((draft) => {
          const isConfirmed = confirmed.has(draft.domain);
          const meta = DOMAIN_META[draft.domain];
          return (
            <div
              key={draft.domain}
              data-testid={`style-domain-${draft.domain}`}
              className={cn(
                "rounded-lg border bg-card p-5",
                isConfirmed && "opacity-70",
              )}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="font-semibold tracking-tight">{meta.title}</h3>
                {isConfirmed && (
                  <Badge variant="success" data-testid={`confirmed-${draft.domain}`}>
                    <Check aria-hidden="true" /> Confirmed
                  </Badge>
                )}
              </div>
              <p className="mb-3 text-sm text-muted-foreground">{meta.lead}</p>
              <div className="mb-4">
                <StyleMeter profile={draft.profile} />
              </div>

              <div className="space-y-3">
                {Object.entries(draft.profile).map(([key, value]) => (
                  <FieldEditor
                    key={key}
                    fieldKey={key}
                    value={value}
                    disabled={isConfirmed}
                    onChange={(v) => updateField(draft.domain, key, v)}
                  />
                ))}
              </div>

              {!isConfirmed && (
                <div className="mt-5 flex items-center gap-2">
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => confirm(draft)}
                    data-testid={`confirm-${draft.domain}`}
                  >
                    {pending ? (
                      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    ) : (
                      <Check aria-hidden="true" className="size-4" />
                    )}
                    Looks right — confirm
                  </Button>
                </div>
              )}
            </div>
          );
        })}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  }

  // Upload phase
  return (
    <div className="space-y-4" data-testid="style-upload">
      <label
        htmlFor="style-files"
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-surface p-10 text-center transition-colors hover:bg-foreground/5",
        )}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
      >
        <Upload aria-hidden="true" className="size-6 text-muted-foreground" />
        <span className="text-sm font-medium">
          Drop files here, or click to browse
        </span>
        <span className="text-xs text-muted-foreground">
          PDFs, Word docs, screenshots — up to {MAX_FILES} files
        </span>
        <input
          id="style-files"
          type="file"
          multiple
          accept={ACCEPTED.join(",")}
          className="sr-only"
          onChange={(e) => addFiles(e.target.files)}
          data-testid="style-file-input"
        />
      </label>

      {files.length > 0 && (
        <ul className="space-y-2" data-testid="style-file-list">
          {files.map((file, i) => (
            <li
              key={`${file.name}-${i}`}
              className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm"
            >
              <FileText aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button
        disabled={files.length === 0 || pending}
        onClick={analyze}
        data-testid="analyze-style"
      >
        <Sparkles aria-hidden="true" className="size-4" />
        Analyze my style
      </Button>
    </div>
  );
}

// PO-2 style-strength meter — per-domain coverage computed in code from what was
// extracted. Color is reserved for state (design rule): a thin profile flags with
// the WCAG-safe warning FILL badge (never amber text), strong reads as success.
const BAND_META = {
  strong: { label: "Strong", variant: "success" as const },
  developing: { label: "Developing", variant: "secondary" as const },
  thin: { label: "Thin", variant: "warning" as const },
};

function StyleMeter({ profile }: { profile: Record<string, unknown> }) {
  const cov = styleCoverage(profile);
  const pct = Math.round(cov.score * 100);
  const band = BAND_META[cov.band];
  return (
    <div className="space-y-1.5" data-testid="style-meter">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="metric-label text-muted-foreground">AI style strength</span>
        <Badge variant={band.variant} data-testid="style-meter-band">
          {band.label}
        </Badge>
      </div>
      <Progress value={pct} aria-label={`Style strength ${pct} percent`} />
      {cov.weak.length > 0 && (
        <p className="text-xs text-muted-foreground" data-testid="style-meter-weak">
          Add examples covering {cov.weak.slice(0, 3).join(", ").toLowerCase()} to
          sharpen this.
        </p>
      )}
    </div>
  );
}

// Generic editor for a profile field: arrays as comma-separated, numbers as
// number inputs, everything else as text.
function FieldEditor({
  fieldKey,
  value,
  disabled,
  onChange,
}: {
  fieldKey: string;
  value: unknown;
  disabled: boolean;
  onChange: (value: unknown) => void;
}) {
  const isArray = Array.isArray(value);
  const isNumber = typeof value === "number";

  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[10rem_1fr] sm:items-center sm:gap-3">
      <Label htmlFor={`f-${fieldKey}`} className="text-xs text-muted-foreground">
        {humanizeField(fieldKey)}
      </Label>
      <Input
        id={`f-${fieldKey}`}
        disabled={disabled}
        value={isArray ? (value as unknown[]).join(", ") : String(value ?? "")}
        onChange={(e) => {
          const raw = e.target.value;
          if (isArray) {
            onChange(raw.split(",").map((s) => s.trim()).filter(Boolean));
          } else if (isNumber) {
            const n = Number(raw);
            onChange(Number.isFinite(n) ? n : raw);
          } else {
            onChange(raw);
          }
        }}
      />
    </div>
  );
}
