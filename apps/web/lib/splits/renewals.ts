// Monthly split-progression scheduler (Phase 5.4). Clients whose live split is ≥
// the cycle length old get a queued monthly split plan_request (which
// runSplitPipeline turns into a coded progression draft). Idempotent: a client
// with a split request already queued/running is skipped. Mirrors plans/renewals.ts.

import type { Database } from "@supertrainer/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type ServiceClient = SupabaseClient<Database>;

const DEFAULT_CYCLE_DAYS = 28;

export async function enqueueSplitProgressions(
  service: ServiceClient,
  asOf: Date,
  cycleDays = DEFAULT_CYCLE_DAYS,
): Promise<{ due: number; queued: number }> {
  const cutoff = new Date(asOf.getTime() - cycleDays * 86400000).toISOString();

  const { data: active } = await service
    .from("splits_active")
    .select("client_id, org_id, split_id")
    .not("split_id", "is", null);
  const rows = active ?? [];
  if (rows.length === 0) return { due: 0, queued: 0 };

  // Which active splits are old enough (by their approved_at) to progress.
  const splitIds = rows.map((r) => r.split_id).filter((v): v is string => !!v);
  const { data: dueSplits } = await service
    .from("splits")
    .select("id")
    .in("id", splitIds.length ? splitIds : ["00000000-0000-0000-0000-000000000000"])
    .not("approved_at", "is", null)
    .lte("approved_at", cutoff);
  const due = new Set((dueSplits ?? []).map((s) => s.id));

  // One query for every split request already in flight.
  const { data: inflight } = await service
    .from("plan_requests")
    .select("client_id")
    .eq("kind", "split")
    .in("status", ["queued", "running"]);
  const busy = new Set((inflight ?? []).map((r) => r.client_id));

  let queued = 0;
  let dueCount = 0;
  for (const row of rows) {
    if (!row.split_id || !due.has(row.split_id)) continue;
    dueCount += 1;
    if (busy.has(row.client_id)) continue;
    const { error } = await service.from("plan_requests").insert({
      org_id: row.org_id,
      client_id: row.client_id,
      kind: "split",
      trigger: "monthly",
      status: "queued",
    });
    if (!error) {
      queued += 1;
      busy.add(row.client_id);
    }
  }
  return { due: dueCount, queued };
}
