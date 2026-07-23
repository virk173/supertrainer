import { NextResponse, type NextRequest } from "next/server";

import { runEditDistillation } from "@/lib/plans/distill-job";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Phase 4.3 — the nightly edit-distillation tick (the learning loop). Vercel Cron
// hits this daily; it folds each org's captured draft_edits into style_exemplars
// (source 'edit_capture'). Embedding is a no-op-safe seam wired in production
// (context7-selected model); without it exemplars are written with a null
// embedding. Fails CLOSED like every background trigger.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const { data: pending } = await service.from("draft_edits").select("org_id").is("distilled_at", null);
  const orgIds = [...new Set((pending ?? []).map((r) => r.org_id))];

  const results = [];
  for (const orgId of orgIds) {
    results.push({ orgId, ...(await runEditDistillation(service, orgId)) });
  }
  return NextResponse.json({ orgs: orgIds.length, results });
}
