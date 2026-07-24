import type { SupabaseClient } from "@supabase/supabase-js";

import { computeMorningDigest } from "@/lib/cards/morning-digest";
import type { Json } from "@supertrainer/db/types";

// Phase 6.5 — the morning-digest tick (db-injected). Per org, assembles the coded
// digest and records it as a `morning_digest` event the trainer surface reads. The
// 7am local PUSH + in-app card render land in P7 (no trainer push infra yet); the
// coded assembly + data ship here.
export async function runMorningDigestTick(
  db: SupabaseClient,
  now: Date,
  opts: { orgIds?: string[] } = {},
): Promise<{ orgs: number }> {
  let q = db.from("orgs").select("id");
  if (opts.orgIds) q = q.in("id", opts.orgIds);
  const { data: orgs, error } = await q;
  if (error) throw error;

  let count = 0;
  for (const o of orgs ?? []) {
    const digest = await computeMorningDigest(db, o.id as string, now);
    await db.from("events").insert({
      org_id: o.id as string,
      type: "morning_digest",
      payload: {
        onTrack: digest.onTrack,
        slipping: digest.slipping,
        pendingDrafts: digest.pendingDrafts,
        renewalsDue: digest.renewalsDue,
        escalationsOvernight: digest.escalationsOvernight,
        lines: digest.lines,
        hasUrgent: digest.hasUrgent,
      } as unknown as Json,
    });
    count++;
  }
  return { orgs: count };
}
