import { NextResponse } from "next/server";

import { getSessionClaims } from "@/lib/onboarding/state";
import { buildMonthlyReport } from "@/lib/reports/monthly";
import { renderReportPdf } from "@/lib/reports/pdf";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Phase 7.6b — the monthly progress report PDF, generated on demand for a client.
// Org ownership is verified in code (service role bypasses RLS).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { orgId, role } = await getSessionClaims();
  if (!orgId || (role !== "owner" && role !== "staff")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const { data: client } = await service
    .from("clients")
    .select("org_id")
    .eq("id", id)
    .maybeSingle();
  if (!client || client.org_id !== orgId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const report = await buildMonthlyReport(id, new Date());
  if (!report) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const pdf = await renderReportPdf(report);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'inline; filename="progress-report.pdf"',
    },
  });
}
