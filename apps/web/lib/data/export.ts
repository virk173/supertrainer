import "server-only";

import { strToU8, zipSync } from "fflate";

import { csvField } from "@/lib/payments/statements-format";
import { createServiceClient } from "@/lib/supabase/server";

import { clientExportSpecs, orgExportSpecs, type TableSpec } from "./registry";

// Phase 9.1 — assembles the data archive behind the trust promise (spec §11
// rule 2). Every table the registry marks `exported` becomes a CSV; a manifest
// documents the schema so the archive is provably usable ELSEWHERE — that is the
// point of the promise, not a checkbox. Runs under the service role with org_id
// applied to every query (service-role bypasses RLS — the tenancy rule).

const PAGE = 1000;
/** Signed download links live 24h (spec); the sweep then marks the job expired. */
export const EXPORT_TTL_SECONDS = 86_400;

type Service = ReturnType<typeof createServiceClient>;
type Row = Record<string, unknown>;

/** Render rows as RFC-4180 CSV. Columns are the union of keys across the page so
 *  a nullable column present on only some rows still gets a header. */
export function rowsToCsv(rows: Row[]): string {
  if (rows.length === 0) return "";
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const head = cols.map(csvField).join(",");
  const body = rows.map((r) =>
    cols
      .map((c) => {
        const v = r[c];
        if (v === null || v === undefined) return "";
        // jsonb/array columns are embedded as JSON so nothing is lost.
        return csvField(typeof v === "object" ? JSON.stringify(v) : String(v));
      })
      .join(","),
  );
  return [head, ...body].join("\r\n");
}

// The table name is dynamic, so the typed client would have to union every
// table's row shape at this one call site — which the compiler gives up on once
// the schema is large enough. The registry already guarantees the name is a real
// table and the column exists; this cast keeps that guarantee where it belongs
// (the registry + its live-schema test) instead of in an unbounded generic.
interface LooseQuery {
  select(cols: string): {
    range(from: number, to: number): LooseFilter;
  };
}
interface LooseFilter extends PromiseLike<{ data: Row[] | null; error: { message: string } | null }> {
  eq(column: string, value: string): LooseFilter;
}
interface LooseClient {
  from(table: string): LooseQuery;
}

/** Read every row of one table for an org (optionally one client), paged. */
async function readAll(
  service: Service,
  spec: TableSpec,
  orgId: string,
  clientId: string | null,
): Promise<Row[]> {
  const db = service as unknown as LooseClient;
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = db.from(spec.table).select("*").range(from, from + PAGE - 1);
    if (spec.orgColumn) q = q.eq(spec.orgColumn, orgId);
    if (clientId && spec.clientColumn) q = q.eq(spec.clientColumn, clientId);
    const { data, error } = await q;
    if (error) throw new Error(`export: reading ${spec.table} failed — ${error.message}`);
    const page = (data ?? []) as Row[];
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
}

export interface ExportManifest {
  generatedAt: string;
  scope: "org" | "client";
  orgId: string;
  clientId: string | null;
  /** table → row count, so a reader can verify nothing was truncated. */
  tables: Record<string, number>;
  format: string;
  notes: string[];
}

/** Build the archive bytes + manifest for one job. Pure-ish: all I/O is reads. */
export async function buildArchive(
  service: Service,
  scope: "org" | "client",
  orgId: string,
  clientId: string | null,
): Promise<{ zip: Uint8Array; manifest: ExportManifest }> {
  const specs = scope === "client" ? clientExportSpecs() : orgExportSpecs();
  const files: Record<string, Uint8Array> = {};
  const counts: Record<string, number> = {};

  for (const spec of specs) {
    const rows = await readAll(service, spec, orgId, scope === "client" ? clientId : null);
    counts[spec.table] = rows.length;
    // Emit every table, even when empty — an absent file is ambiguous ("missing"
    // vs "none"); an empty one is unambiguous.
    files[`data/${spec.table}.csv`] = strToU8(rowsToCsv(rows));
  }

  const manifest: ExportManifest = {
    generatedAt: new Date().toISOString(),
    scope,
    orgId,
    clientId: scope === "client" ? clientId : null,
    tables: counts,
    format:
      "One RFC-4180 CSV per table under data/. The first row is the header. " +
      "jsonb and array columns are embedded as JSON strings. Timestamps are ISO-8601 UTC.",
    notes: [
      "This archive is yours. It is designed to be readable without our software.",
      "Row counts above let you verify nothing was truncated.",
      "Files are named for the table they came from; ids are stable across tables so you can rejoin them.",
      "Empty files mean that table had no rows — not that data was withheld.",
    ],
  };

  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  files["README.txt"] = strToU8(
    [
      "supertrainer data export",
      "",
      `Generated: ${manifest.generatedAt}`,
      `Scope:     ${scope === "client" ? "single client" : "whole organisation"}`,
      "",
      "data/*.csv   one file per table, RFC-4180, header row first",
      "manifest.json  row counts + format notes",
      "",
      "Your data is yours. This archive is deliberately plain CSV so you can open it",
      "in a spreadsheet, load it into another tool, or keep it as a record.",
    ].join("\n"),
  );

  return { zip: zipSync(files), manifest };
}

/** Run a queued export job end-to-end: build, upload, mark ready. Throws on
 *  failure AFTER recording the error on the job, so the caller can log + retry. */
export async function runExportJob(jobId: string): Promise<void> {
  const service = createServiceClient();

  const { data: job, error: jobErr } = await service
    .from("export_jobs")
    .select("id, org_id, scope, client_id, status")
    .eq("id", jobId)
    .single();
  if (jobErr || !job) throw new Error(`export: job ${jobId} not found`);
  if (job.status === "ready") return; // already done — idempotent

  await service
    .from("export_jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", jobId);

  try {
    const { zip } = await buildArchive(
      service,
      job.scope as "org" | "client",
      job.org_id,
      job.client_id,
    );
    const path = `${job.org_id}/${job.id}.zip`;
    const { error: upErr } = await service.storage
      .from("exports")
      .upload(path, zip, { contentType: "application/zip", upsert: true });
    if (upErr) throw new Error(`export: upload failed — ${upErr.message}`);

    await service
      .from("export_jobs")
      .update({
        status: "ready",
        storage_path: path,
        size_bytes: zip.byteLength,
        completed_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + EXPORT_TTL_SECONDS * 1000).toISOString(),
        error: null,
      })
      .eq("id", jobId);
  } catch (err) {
    await service
      .from("export_jobs")
      .update({ status: "failed", error: String(err), completed_at: new Date().toISOString() })
      .eq("id", jobId);
    throw err;
  }
}

/** A short-lived signed download link for a ready job. */
export async function signedExportUrl(jobId: string, orgId: string): Promise<string | null> {
  const service = createServiceClient();
  const { data: job } = await service
    .from("export_jobs")
    .select("org_id, storage_path, status")
    .eq("id", jobId)
    .maybeSingle();
  // Tenancy verified in code — the service role bypasses RLS.
  if (!job || job.org_id !== orgId || job.status !== "ready" || !job.storage_path) return null;
  const { data } = await service.storage
    .from("exports")
    .createSignedUrl(job.storage_path, EXPORT_TTL_SECONDS);
  return data?.signedUrl ?? null;
}
