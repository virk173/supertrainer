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
  if (rows.length === 0) return { due: 0, queued: 0 };

  // One query for every diet request already in flight, rather than one per
  // client — the loop below just checks membership.
  const { data: inflight } = await service
    .from("plan_requests")
    .select("client_id")
    .eq("kind", "diet")
    .in("status", ["queued", "running"]);
  const busy = new Set((inflight ?? []).map((r) => r.client_id));

  let queued = 0;
  for (const row of rows) {
    if (busy.has(row.client_id)) continue;
    const { error } = await service.from("plan_requests").insert({
      org_id: row.org_id,
      client_id: row.client_id,
      kind: "diet",
      trigger: "monthly",
      status: "queued",
    });
    if (!error) {
      queued += 1;
      busy.add(row.client_id); // guard against duplicate plans_active rows for one client
    }
  }
  return { due: rows.length, queued };
}
