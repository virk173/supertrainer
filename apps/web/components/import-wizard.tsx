"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Loader2,
  Sparkles,
  Undo2,
  Upload,
} from "lucide-react";

import { Button } from "@supertrainer/ui/components/button";
import { cn } from "@supertrainer/ui/lib/utils";

import {
  aiProposeMapping,
  draftInvites,
  importClients,
  undoImport,
} from "@/app/onboarding/import/actions";
import {
  FIELD_LABELS,
  IMPORT_FIELDS,
  applyMapping,
  validateRows,
  type ColumnMap,
  type MappedRow,
  type ValidationResult,
} from "@/lib/import/fields";
import { parseRosterFile, type ParsedSheet } from "@/lib/import/parse";

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function ImportWizard() {
  const [phase, setPhase] = React.useState<"upload" | "map" | "review" | "done">(
    "upload",
  );
  const [parsed, setParsed] = React.useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = React.useState<ColumnMap>({});
  const [mappedRows, setMappedRows] = React.useState<MappedRow[]>([]);
  const [validation, setValidation] = React.useState<ValidationResult | null>(null);
  const [imported, setImported] = React.useState<{
    batchId: string;
    clients: { id: string; name: string }[];
  } | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [aiPending, setAiPending] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const sheet = await parseRosterFile(file);
      if (sheet.headers.length === 0 || sheet.rows.length === 0) {
        setError("That file looks empty. Export with a header row and try again.");
        return;
      }
      setParsed(sheet);
      setMapping({});
      setPhase("map");

      // AI proposes a mapping the trainer confirms — never auto-applied.
      setAiPending(true);
      const result = await aiProposeMapping(sheet.headers, sheet.rows.slice(0, 5));
      setAiPending(false);
      if (result.ok && result.mapping) {
        const proposed: ColumnMap = {};
        for (const field of IMPORT_FIELDS) {
          const source = result.mapping[field];
          if (source && sheet.headers.includes(source)) proposed[field] = source;
        }
        setMapping(proposed);
      }
    } catch (err) {
      setAiPending(false);
      setError(err instanceof Error ? err.message : "Couldn't read that file.");
    }
  }

  function toReview() {
    if (!parsed) return;
    const rows = applyMapping(parsed.rows, mapping);
    setMappedRows(rows);
    setValidation(validateRows(rows, mapping));
    setPhase("review");
  }

  async function doImport() {
    setPending(true);
    setError(null);
    const result = await importClients(mappedRows);
    setPending(false);
    if (!result.ok || !result.clients) {
      setError(result.message ?? "Import failed.");
      return;
    }
    setImported({ batchId: result.batchId!, clients: result.clients });
    setSelected(new Set(result.clients.map((c) => c.id)));
    setPhase("done");
  }

  async function draftSelected() {
    setPending(true);
    setError(null);
    const result = await draftInvites([...selected]);
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? "Couldn't queue invites.");
      return;
    }
    setNotice(`${result.count} invite draft${result.count === 1 ? "" : "s"} queued.`);
  }

  async function undo() {
    if (!imported) return;
    setPending(true);
    setError(null);
    const result = await undoImport(imported.batchId);
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? "Undo failed.");
      return;
    }
    setImported(null);
    setParsed(null);
    setMapping({});
    setPhase("upload");
    setNotice("Import undone.");
  }

  // ── Upload ─────────────────────────────────────────────────────────────────
  if (phase === "upload") {
    return (
      <div className="space-y-4">
        <label
          htmlFor="roster-file"
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-surface p-10 text-center transition-colors hover:bg-foreground/5"
        >
          <Upload aria-hidden="true" className="size-6 text-muted-foreground" />
          <span className="text-sm font-medium">Upload your client export</span>
          <span className="text-xs text-muted-foreground">
            CSV or XLSX from Trainerize, Everfit, TrueCoach, or a spreadsheet
          </span>
          <input
            id="roster-file"
            type="file"
            accept=".csv,.tsv,.xlsx,.xls,text/csv"
            className="sr-only"
            onChange={(e) => onFile(e.target.files?.[0])}
            data-testid="roster-input"
          />
        </label>
        {notice && <p className="text-sm text-success" data-testid="import-notice">{notice}</p>}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  }

  // -- Map --
  if (phase === "map" && parsed) {
    return (
      <div className="space-y-6" data-testid="import-map">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {aiPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Suggesting a mapping…
            </>
          ) : (
            <>
              <Sparkles className="size-4 text-success" />
              We proposed a mapping — check it and fix anything.
            </>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {IMPORT_FIELDS.map((field) => (
            <div key={field} className="space-y-1">
              <label
                htmlFor={`map-${field}`}
                className={cn(
                  "text-xs",
                  field === "allergies" ? "font-medium text-warning" : "text-muted-foreground",
                )}
              >
                {FIELD_LABELS[field]}
                {field === "allergies" && " (recommended)"}
              </label>
              <select
                id={`map-${field}`}
                className={selectClass}
                value={mapping[field] ?? ""}
                onChange={(e) =>
                  setMapping((m) => ({ ...m, [field]: e.target.value || null }))
                }
                data-testid={`map-${field}`}
              >
                <option value="">— not mapped —</option>
                {parsed.headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <p className="metric-label">Preview (first 5 rows)</p>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface">
                <tr>
                  {parsed.headers.map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-t">
                    {parsed.headers.map((h) => (
                      <td key={h} className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                        {row[h]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <Button onClick={toReview} data-testid="import-continue">
          Continue <ArrowRight className="size-4" />
        </Button>
      </div>
    );
  }

  // -- Review --
  if (phase === "review" && validation) {
    return (
      <div className="space-y-5" data-testid="import-review">
        <p className="text-sm">
          <span className="metric">{validation.importableCount}</span> clients
          ready to import.
        </p>

        {validation.allergiesUnmapped && (
          <p className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning" data-testid="allergies-warning">
            <AlertTriangle className="size-4 shrink-0" />
            No allergies column mapped — allergy safety checks won&apos;t have data.
          </p>
        )}

        {validation.rowIssues.length > 0 ? (
          <div className="space-y-1" data-testid="row-issues">
            <p className="text-sm font-medium">
              {validation.rowIssues.length} row
              {validation.rowIssues.length === 1 ? "" : "s"} need a look (they
              still import as leads):
            </p>
            <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
              {validation.rowIssues.slice(0, 20).map((ri) => (
                <li key={ri.row}>
                  Row {ri.row}: {ri.issues.join(", ")}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-success">
            <Check className="size-4" /> No issues found.
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => setPhase("map")}>
            Back
          </Button>
          <Button onClick={doImport} disabled={pending} data-testid="import-confirm">
            {pending && <Loader2 className="size-4 animate-spin" />}
            Import {validation.importableCount} clients
          </Button>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  }

  // -- Done --
  if (phase === "done" && imported) {
    return (
      <div className="space-y-5" data-testid="import-done">
        <p className="flex items-center gap-2 text-sm text-success">
          <Check className="size-4" />
          <span className="metric">{imported.clients.length}</span> clients
          imported.
        </p>

        <div className="rounded-md border">
          <div className="flex items-center justify-between border-b bg-surface px-3 py-2 text-xs">
            <span className="font-medium">Draft invites for…</span>
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() =>
                setSelected((s) =>
                  s.size === imported.clients.length
                    ? new Set()
                    : new Set(imported.clients.map((c) => c.id)),
                )
              }
            >
              {selected.size === imported.clients.length ? "Clear all" : "Select all"}
            </button>
          </div>
          <ul className="max-h-56 overflow-y-auto">
            {imported.clients.map((c) => (
              <li key={c.id} className="flex items-center gap-2 border-t px-3 py-2 text-sm first:border-t-0">
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={(e) =>
                    setSelected((s) => {
                      const next = new Set(s);
                      if (e.target.checked) next.add(c.id);
                      else next.delete(c.id);
                      return next;
                    })
                  }
                  className="size-4 rounded border-input"
                />
                {c.name}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={draftSelected}
            disabled={pending || selected.size === 0}
            data-testid="draft-invites"
          >
            Draft invites ({selected.size})
          </Button>
          <Button variant="ghost" onClick={undo} disabled={pending} data-testid="undo-import">
            <Undo2 className="size-4" /> Undo import
          </Button>
          <Button asChild variant="ghost">
            <Link href="/onboarding">
              Back to checklist <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
        {notice && <p className="text-sm text-success" data-testid="import-notice">{notice}</p>}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  }

  return null;
}
