import { NextResponse, type NextRequest } from "next/server";

import { getSessionClaims } from "@/lib/onboarding/state";
import { buildFinancialCsv, getStatementRows } from "@/lib/payments/statements";

export const dynamic = "force-dynamic";

// Phase 8.5 — accountant-friendly monthly financial export. Staff-only; scoped
// to the caller's org (getStatementRows reads by orgId under the service role).
export async function GET(request: NextRequest) {
  const { orgId, role } = await getSessionClaims();
  if (!orgId || (role !== "owner" && role !== "staff")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const month = request.nextUrl.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }

  const rows = await getStatementRows(orgId, month);
  const csv = buildFinancialCsv(rows);
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="statement-${month}.csv"`,
    },
  });
}
