// Defined here (not re-exported from @supertrainer/ai) so this client-reachable
// module never pulls the server-only AI barrel (Anthropic SDK, langfuse) into
// the browser bundle. Kept in sync with the agent's copy in packages/ai.
export const IMPORT_FIELDS = [
  "name",
  "email",
  "phone",
  "goal",
  "current_weight",
  "height",
  "birthday",
  "dietary_preference",
  "allergies",
  "notes",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const FIELD_LABELS: Record<ImportField, string> = {
  name: "Name",
  email: "Email",
  phone: "Phone",
  goal: "Goal",
  current_weight: "Current weight",
  height: "Height",
  birthday: "Birthday",
  dietary_preference: "Dietary preference",
  allergies: "Allergies",
  notes: "Notes",
};

// Allergies is safety-critical (an unmapped allergies column is a warning, not
// a block); name maps to a client's display; everything else is optional.
export const RECOMMENDED_FIELDS: ImportField[] = ["name", "allergies"];

export type SourceRow = Record<string, string>;
export type ColumnMap = Partial<Record<ImportField, string | null>>;
export type MappedRow = Partial<Record<ImportField, string>>;

export function applyMapping(rows: SourceRow[], mapping: ColumnMap): MappedRow[] {
  return rows.map((row) => {
    const out: MappedRow = {};
    for (const field of IMPORT_FIELDS) {
      const source = mapping[field];
      const value = source ? (row[source] ?? "").trim() : "";
      if (value) out[field] = value;
    }
    return out;
  });
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export interface RowIssue {
  row: number; // 1-indexed
  issues: string[];
}

export interface ValidationResult {
  rowIssues: RowIssue[];
  allergiesUnmapped: boolean;
  importableCount: number;
}

// Flags rows missing BOTH email and phone, invalid emails, and duplicate
// emails within the batch. Rows with issues can still import (they're leads),
// but the trainer sees exactly what's off first.
export function validateRows(
  rows: MappedRow[],
  mapping: ColumnMap,
): ValidationResult {
  const seen = new Map<string, number>();
  const rowIssues: RowIssue[] = [];

  rows.forEach((row, i) => {
    const issues: string[] = [];
    const email = (row.email ?? "").trim().toLowerCase();
    const phone = (row.phone ?? "").trim();

    if (!email && !phone) issues.push("No email or phone");
    if (email && !isValidEmail(email)) issues.push("Invalid email");
    if (email && isValidEmail(email)) {
      if (seen.has(email)) {
        issues.push(`Duplicate email (row ${seen.get(email)! + 1})`);
      } else {
        seen.set(email, i);
      }
    }
    if (issues.length > 0) rowIssues.push({ row: i + 1, issues });
  });

  return {
    rowIssues,
    allergiesUnmapped: !mapping.allergies,
    importableCount: rows.length,
  };
}
