import Papa from "papaparse";
import * as XLSX from "xlsx";

import type { SourceRow } from "./fields";

export interface ParsedSheet {
  headers: string[];
  rows: SourceRow[];
}

// Parses a coach's exported roster (CSV/TSV via papaparse, XLSX/XLS via
// sheetjs) into headers + string rows keyed by header. Runs in the browser so
// the mapping UI and preview are instant. Unicode names and quoted commas are
// handled by the parsers.
export async function parseRosterFile(file: File): Promise<ParsedSheet> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return parseXlsx(file);
  }
  return parseCsv(file);
}

function normalizeHeaders(raw: string[]): string[] {
  return raw.map((h, i) => h?.trim() || `Column ${i + 1}`);
}

async function parseCsv(file: File): Promise<ParsedSheet> {
  const text = await file.text();
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  const headers = normalizeHeaders(result.meta.fields ?? []);
  const rows = (result.data ?? []).map((row) => {
    const out: SourceRow = {};
    for (const h of headers) out[h] = String(row[h] ?? "");
    return out;
  });
  return { headers, rows };
}

async function parseXlsx(file: File): Promise<ParsedSheet> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
    raw: false,
  });
  if (matrix.length === 0) return { headers: [], rows: [] };
  const headers = normalizeHeaders((matrix[0] ?? []).map((h) => String(h)));
  const rows = matrix.slice(1).map((cells) => {
    const out: SourceRow = {};
    headers.forEach((h, i) => {
      out[h] = String(cells[i] ?? "").trim();
    });
    return out;
  });
  return { headers, rows };
}
