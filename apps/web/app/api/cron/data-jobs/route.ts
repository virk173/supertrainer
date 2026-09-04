import { NextResponse, type NextRequest } from "next/server";

import { runDeletion } from "@/lib/data/deletion";
import { runExportJob } from "@/lib/data/export";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Phase 9.1 — the data-rights worker: builds queued export archives and executes
// deletion requests whose 30-day grace has elapsed. Fails CLOSED like every cron.
// Both halves are idempotent (a ready job returns early; a completed request is a
// no-op), so a re-run or overlapping tick is safe.
const BATCH = 5;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const now = new Date();
  const exported: string[] = [];
  const deleted: string[] = [];
  const failed: { id: string; error: string }[] = [];

  // ── monthly archives (opt-in) ─────────────────────────────────────────────
  // Enqueued BEFORE the build pass so an org that opted in gets its archive on
  // the same tick. 25 days of slack keeps a monthly cadence without ever queuing
  // two in one month.
  const queued: string[] = [];
  const cutoff = new Date(now.getTime() - 25 * 86_400_000).toISOString();
  const { data: optedIn } = await service
    .from("orgs")
    .select("id")
    .eq("data_export_monthly", true);
  for (const org of optedIn ?? []) {
    const { count } = await service
      .from("export_jobs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id)
      .eq("scope", "org")
      .gte("requested_at", cutoff);
    if ((count ?? 0) > 0) continue;
    const { data: job } = await service
      .from("export_jobs")
      .insert({ org_id: org.id, scope: "org", requested_by: null })
      .select("id")
      .single();
    if (job) queued.push(job.id);
  }

  // ── queued exports, oldest first ──────────────────────────────────────────
  const { data: jobs } = await service
    .from("export_jobs")
    .select("id")
    .eq("status", "queued")
    .order("requested_at", { ascending: true })
    .limit(BATCH);
  for (const job of jobs ?? []) {
    try {
      await runExportJob(job.id);
      exported.push(job.id);
    } catch (err) {
      failed.push({ id: job.id, error: String(err) });
      console.error("[data-jobs] export failed", job.id, err);
    }
  }

  // ── expire stale download links ───────────────────────────────────────────
  await service
    .from("export_jobs")
    .update({ status: "expired" })
    .eq("status", "ready")
    .lt("expires_at", now.toISOString());

  // ── deletions past their grace window ─────────────────────────────────────
  const { data: requests } = await service
    .from("deletion_requests")
    .select("id")
    .eq("status", "pending")
    .lt("grace_until", now.toISOString())
    .limit(BATCH);
  for (const req of requests ?? []) {
    try {
      const result = await runDeletion(req.id, now);
      if (result) deleted.push(req.id);
    } catch (err) {
      failed.push({ id: req.id, error: String(err) });
      console.error("[data-jobs] deletion failed", req.id, err);
    }
  }

  return NextResponse.json({
    queued: queued.length,
    exported: exported.length,
    deleted: deleted.length,
    failed,
  });
}
