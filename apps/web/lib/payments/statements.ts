import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

import { buildFinancialCsv, csvField, type StatementRow } from "./statements-format";

// Phase 8.5 — accountant-friendly monthly financial export. Pure CSV formatting
// lives in ./statements-format (tested); this is the service-role reader.
export { buildFinancialCsv, csvField };
export type { StatementRow };

/** Read one org's captured payments for a month (YYYY-MM), oldest first. */
export async function getStatementRows(orgId: string, month: string): Promise<StatementRow[]> {
  const service = createServiceClient();
  const start = `${month}-01T00:00:00.000Z`;
  const end = new Date(Date.parse(start));
  end.setUTCMonth(end.getUTCMonth() + 1);

  const { data } = await service
    .from("payment_records")
    .select("created_at, stripe_invoice_id, amount_cents, application_fee_cents, currency, status")
    .eq("org_id", orgId)
    .gte("created_at", start)
    .lt("created_at", end.toISOString())
    .order("created_at", { ascending: true });

  return (data ?? []).map((r) => ({
    date: r.created_at,
    invoiceId: r.stripe_invoice_id,
    amountCents: r.amount_cents,
    applicationFeeCents: r.application_fee_cents,
    currency: r.currency,
    status: r.status,
  }));
}
