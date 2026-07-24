// Phase 8.5 — pure CSV formatting for the financial export (no server imports,
// so it's testable). The reader lives in ./statements (server-only).

/** RFC-4180: quote a field if it contains a comma, quote, or newline; double
 *  embedded quotes. */
export function csvField(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export interface StatementRow {
  date: string;
  invoiceId: string | null;
  amountCents: number;
  applicationFeeCents: number;
  currency: string;
  status: string;
}

const HEADER = ["Date", "Invoice", "Gross", "Platform fee", "Net", "Currency", "Status"];

/** Build the CSV text for a set of payment rows (money as decimal strings;
 *  net = gross − platform fee). CRLF line endings (RFC-4180 default). */
export function buildFinancialCsv(rows: StatementRow[]): string {
  const lines = [HEADER.map(csvField).join(",")];
  for (const r of rows) {
    const gross = (r.amountCents / 100).toFixed(2);
    const fee = (r.applicationFeeCents / 100).toFixed(2);
    const net = ((r.amountCents - r.applicationFeeCents) / 100).toFixed(2);
    lines.push(
      [
        csvField(r.date.slice(0, 10)),
        csvField(r.invoiceId),
        csvField(gross),
        csvField(fee),
        csvField(net),
        csvField(r.currency.toUpperCase()),
        csvField(r.status),
      ].join(","),
    );
  }
  return lines.join("\r\n");
}
