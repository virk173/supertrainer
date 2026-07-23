// Monthly renewal scheduler (Phase 4.4). Clients whose live plan is ≥ the cycle
// length old get a queued monthly plan_request (which runDietPipeline turns into
// a ledger-informed adjustment draft). Idempotent: a client with a diet request
// already queued/running is skipped, so re-runs never pile up duplicates.

import type { Database } from "@supertrainer/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type ServiceClient = SupabaseClient<Database>;

const DEFAULT_CYCLE_DAYS = 28;

export async function enqueueRenewals(
  service: ServiceClient,
  asOf: Date,
  cycleDays = DEFAULT_CYCLE_DAYS,
): Promise<{ due: number; queued: number }> {
  const cutoff = new Date(asOf.getTime() - cycleDays * 86400000).toISOString().slice(0, 10);
  const { data: due } = await service
    .from("plans_active")
    .select("client_id, org_id, effective_from")
    .not("effective_from", "is", null)
    .lte("effective_from", cutoff);

  const rows = due ?? [];
  let queued = 0;
  for (const row of rows) {
    // Skip clients that already have a diet request in flight.
    const { count } = await service
      .from("plan_requests")
      .select("id", { count: "exact", head: true })
      .eq("client_id", row.client_id)
      .eq("kind", "diet")
      .in("status", ["queued", "running"]);
    if (count && count > 0) continue;

    const { error } = await service.from("plan_requests").insert({
      org_id: row.org_id,
      client_id: row.client_id,
      kind: "diet",
      trigger: "monthly",
      status: "queued",
    });
    if (!error) queued += 1;
  }
  return { due: rows.length, queued };
}
