import "server-only";

import { nextSection, type SectionAnswers } from "@supertrainer/ai";

import { trackServer } from "@/lib/analytics/server";
import { isNudgeDue } from "@/lib/interview/nudge";
import { dayNumber } from "@/lib/interview/pacing";
import { createServiceClient } from "@/lib/supabase/server";

const NUDGE_BODY =
  "Hey — no rush at all. Whenever you've got a minute, we can pick up your intake right where we left off.";
const MAX_PER_TICK = 200;

// Delivery-agnostic stall handling (Phase 2 backstop). A scheduled tick
// (app/api/cron/interview-nudges) calls this. It nudges an interview idle >24h,
// but ONLY when a section is actually open for the client — so we never poke
// someone correctly waiting for the next day's sections to unlock. In-app nudge
// + event now; push/email delivery attaches at notifyClient() in Phase 6.
export async function runInterviewNudges(now: number = Date.now()): Promise<{ nudged: number }> {
  const service = createServiceClient();

  const { data: rows } = await service
    .from("interview_state")
    .select("client_id, org_id, answers, started_at, last_prompt_at, nudges_sent")
    .eq("status", "in_progress")
    .order("last_prompt_at", { ascending: true })
    .limit(MAX_PER_TICK);

  let nudged = 0;
  for (const row of rows ?? []) {
    if (!row.last_prompt_at) continue;
    if (!isNudgeDue(row.last_prompt_at, row.nudges_sent, now)) continue;

    // Only nudge when the ball is in the client's court. Defensive: under the
    // current day-pacing a section unlocks before the 24h idle timer fires, so
    // this is already implied — but it keeps the nudge correct if the pacing or
    // the idle window ever change independently.
    const answers = (row.answers ?? {}) as Record<string, SectionAnswers>;
    if (nextSection(answers, dayNumber(row.started_at, now)) === null) continue;

    // Lease the row with optimistic concurrency on last_prompt_at so two
    // overlapping ticks can't both nudge. Bump BEFORE posting.
    const { data: leased } = await service
      .from("interview_state")
      .update({
        nudges_sent: row.nudges_sent + 1,
        last_prompt_at: new Date(now).toISOString(),
      })
      .eq("client_id", row.client_id)
      .eq("status", "in_progress")
      .eq("last_prompt_at", row.last_prompt_at)
      .select("client_id");
    if (!leased || leased.length === 0) continue;

    await service.from("messages").insert({
      org_id: row.org_id,
      client_id: row.client_id,
      sender: "assistant",
      kind: "interview",
      body: NUDGE_BODY,
    });
    await trackServer({ orgId: row.org_id, event: "interview_nudge_sent", clientId: row.client_id });
    notifyClient(row.org_id, row.client_id);
    nudged += 1;
  }

  return { nudged };
}

// Phase 6 seam: send the nudge over the client's real channel (Web Push / email
// digest). Today a no-op — the in-app message above is the whole delivery. The
// params are part of the seam's future signature, unused until Phase 6.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function notifyClient(_orgId: string, _clientId: string): void {
  // intentionally empty until Phase 6 wires Web Push / email.
}
