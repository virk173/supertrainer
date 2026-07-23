import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { runSplitPipeline } from "../../lib/splits/run";
import { approveSplit } from "../../lib/splits/mutations";
import { enqueueSplitProgressions } from "../../lib/splits/renewals";
import { fakeSplitAgents } from "./split-fakes";
import { serviceClient } from "./helpers";

// End-to-end coverage of the monthly progression loop: an approved split + a
// cycle of logged sets → runSplitPipeline (trigger=monthly) drafts a coded,
// based_on progression with per-exercise reasons; enqueueSplitProgressions ages
// live splits into the queue idempotently. Mirrors plans-renewals.spec.ts.

function daysAgo(n: number): string {
  // Deterministic dates relative to a fixed anchor is unnecessary here — the
  // logs just need to be inside the 28-day window; use the injected system date.
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

async function seedApprovedSplitWithLogs() {
  const db = serviceClient();
  const orgId = randomUUID();
  await db.from("orgs").insert({ id: orgId, name: "Prog Org", slug: `prog-${orgId.slice(0, 8)}` });
  const { data: user } = await db.auth.admin.createUser({ email: `prog-${orgId.slice(0, 8)}@test.local`, email_confirm: true });
  const profileId = user!.user!.id;
  await db.from("profiles").upsert({ id: profileId, org_id: orgId, role: "owner" });
  const clientId = randomUUID();
  await db.from("clients").insert({
    id: clientId, org_id: orgId, profile_id: profileId, status: "active", source: "invite",
    intake: { goal: "build_muscle", stage_b: { training: { daysPerWeek: 4, equipmentAccess: "full gym", experience: "advanced" } } },
    health_flags: {},
  });

  // Draft + approve a split so splits_active is populated with real exercises.
  const { data: req } = await db
    .from("plan_requests")
    .insert({ org_id: orgId, client_id: clientId, kind: "split", trigger: "onboarding", status: "queued" })
    .select("id").single();
  const draft = await runSplitPipeline(db, req!.id, { deps: fakeSplitAgents });
  await approveSplit(db, { splitId: draft.splitId!, orgId, approverId: profileId });

  // Log 3 progressing sessions per prescribed exercise (top of the rep range).
  const { data: active } = await db.from("splits_active").select("days").eq("client_id", clientId).single();
  const daysMap = active!.days as Record<string, { exercise_id: string; name: string; target_reps: string }[]>;
  const seen = new Set<string>();
  const flat = Object.values(daysMap).flat().filter((e) => (seen.has(e.exercise_id) ? false : seen.add(e.exercise_id)));
  const rows = flat.flatMap((ex, exIdx) => {
    const top = Math.max(...(ex.target_reps.match(/\d+/g) ?? ["12"]).map(Number));
    return [21, 14, 7].map((ago, i) => ({
      org_id: orgId,
      client_id: clientId,
      tz_date: daysAgo(ago),
      exercise_id: ex.exercise_id,
      exercise_name: ex.name,
      set_number: 1,
      weight_kg: 50 + exIdx * 5 + i * 2.5,
      reps: top,
    }));
  });
  await db.from("workout_logs").insert(rows);

  return { db, orgId, clientId, profileId, activeSplitId: draft.splitId!, cleanup: async () => {
    await db.from("orgs").delete().eq("id", orgId);
    await db.auth.admin.deleteUser(profileId);
  } };
}

test("monthly trigger drafts a coded progression based_on the active split", async () => {
  const { db, orgId, clientId, activeSplitId, cleanup } = await seedApprovedSplitWithLogs();
  try {
    const { data: req } = await db
      .from("plan_requests")
      .insert({ org_id: orgId, client_id: clientId, kind: "split", trigger: "monthly", status: "queued" })
      .select("id").single();

    const res = await runSplitPipeline(db, req!.id, { deps: fakeSplitAgents });
    expect(res.status).toBe("drafted");

    const { data: draft } = await db
      .from("splits")
      .select("based_on_split_id, source, meta, status, version")
      .eq("id", res.splitId!)
      .single();
    expect(draft!.status).toBe("draft");
    expect(draft!.source).toBe("monthly");
    expect(draft!.based_on_split_id).toBe(activeSplitId);

    const meta = draft!.meta as { progression: { changeKind: string; reason: string }[] };
    expect(meta.progression.length).toBeGreaterThan(0);
    // Progressing logs (top of range) → load/reps advances, each with a reason.
    expect(meta.progression.every((p) => p.reason.length > 0)).toBe(true);
    expect(meta.progression.some((p) => p.changeKind === "add_load" || p.changeKind === "add_reps")).toBe(true);

    // The request advanced.
    const { data: reqRow } = await db.from("plan_requests").select("status").eq("id", req!.id).single();
    expect(reqRow!.status).toBe("drafted");
  } finally {
    await cleanup();
  }
});

test("enqueueSplitProgressions queues aged live splits, idempotently", async () => {
  const { db, clientId, activeSplitId, cleanup } = await seedApprovedSplitWithLogs();
  try {
    // Fresh split → not due yet (assert client-scoped; the global counters can
    // move under parallel tests).
    await enqueueSplitProgressions(db, new Date());
    const { data: none } = await db
      .from("plan_requests")
      .select("id")
      .eq("client_id", clientId)
      .eq("kind", "split")
      .eq("trigger", "monthly");
    expect(none).toHaveLength(0);

    // Age the approved split past the cycle.
    await db
      .from("splits")
      .update({ approved_at: new Date(Date.now() - 40 * 86400000).toISOString() })
      .eq("id", activeSplitId);

    const first = await enqueueSplitProgressions(db, new Date());
    expect(first.queued).toBeGreaterThanOrEqual(1);
    const { data: queued } = await db
      .from("plan_requests")
      .select("id")
      .eq("client_id", clientId)
      .eq("kind", "split")
      .eq("trigger", "monthly")
      .eq("status", "queued");
    expect(queued).toHaveLength(1);

    // Idempotent: a client with a split request in flight is skipped.
    const second = await enqueueSplitProgressions(db, new Date());
    const { data: still } = await db
      .from("plan_requests")
      .select("id")
      .eq("client_id", clientId)
      .eq("kind", "split")
      .eq("trigger", "monthly")
      .eq("status", "queued");
    expect(still).toHaveLength(1);
    expect(second.queued).toBe(0);
  } finally {
    await cleanup();
  }
});
