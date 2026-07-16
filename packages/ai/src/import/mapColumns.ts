import { z } from "zod";

import { zodOutput } from "../zodOutput";

// The client fields we import into. Order drives the mapping UI.
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

// Proposed mapping: each of our fields → the source column header that best
// matches, or null when nothing fits. The user always confirms before import.
export const ColumnMappingSchema = z.object({
  name: z.string().nullable().describe("Source column for the client's full name."),
  email: z.string().nullable().describe("Source column for email address."),
  phone: z.string().nullable().describe("Source column for phone number."),
  goal: z.string().nullable().describe("Source column for their training/nutrition goal."),
  current_weight: z.string().nullable().describe("Source column for current bodyweight."),
  height: z.string().nullable().describe("Source column for height."),
  birthday: z.string().nullable().describe("Source column for birth date."),
  dietary_preference: z
    .string()
    .nullable()
    .describe("Source column for dietary preference (vegan, veg, etc.)."),
  allergies: z
    .string()
    .nullable()
    .describe("Source column for food allergies — critical, map carefully."),
  notes: z.string().nullable().describe("Source column for free-form notes."),
});
export type ColumnMapping = z.infer<typeof ColumnMappingSchema>;

const SYSTEM = `You map a coach's exported client spreadsheet columns onto our client fields.

Rules:
- For each of our fields, pick the ONE source column header that best matches, or null if none fits.
- Use the sample values, not just the header text, to disambiguate.
- allergies is safety-critical: only map a column that truly holds allergies, never a generic "notes" column.
- Never map two of our fields to the same source column unless the data genuinely serves both.
- Return the exact source header string.`;

export async function mapColumns(
  headers: string[],
  sampleRows: Record<string, string>[],
): Promise<ColumnMapping> {
  const sample = sampleRows
    .slice(0, 5)
    .map((row, i) => `Row ${i + 1}: ${JSON.stringify(row)}`)
    .join("\n");

  return zodOutput(ColumnMappingSchema, {
    task: "parse",
    system: SYSTEM,
    cacheSystem: true,
    prompt: `Source columns: ${JSON.stringify(headers)}\n\nSample rows:\n${sample}\n\nMap these onto our fields.`,
  });
}
