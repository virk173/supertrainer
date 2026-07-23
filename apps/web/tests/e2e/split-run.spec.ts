import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { runSplitPipeline } from "../../lib/splits/run";
import { fakeSplitAgents } from "./split-fakes";
import { serviceClient } from "./helpers";

// End-to-end DB path for the split pipeline with the injected deterministic
// agents. Proves runSplitPipeline reads the queued request, org-checks the
// client, compiles the injury-safe pool, writes a draft splits row (days +
// schedule + meta), advances the request, and fires onDrafted. Mirrors
// diet-run.spec.ts.

async function seedSplitClient(opts: {
  daysPerWeek: number;
  equipment: string;
  experience: string;
  injury?: string;
  trigger?: "onboarding" | "monthly" | "manual";
}) {
  const db = serviceClient();
  const orgId = randomUUID();
  await db.from("orgs").insert({ id: orgId, name: "Split Org", slug: `split-${orgId.slice(0, 8)}` });
  const { data: user } = await db.auth.admin.createUser({
    email: `split-${orgId.slice(0, 8)}@test.local`,
    email_confirm: true,
  });
  const profileId = user!.user!.id;
  await db.from("profiles").upsert({ id: profileId, org_id: orgId, role: "client" });

  const clientId = randomUUID();
  await db.from("clients").insert({
    id: clientId,
    org_id: orgId,
    profile_id: profileId,
    status: "active",
    source: "invite",
    intake: {
      goal: "build_muscle",
      stage_b: {
        training: {
          daysPerWeek: opts.daysPerWeek,
          equipmentAccess: opts.equipment,
          experience: opts.experience,
        },
      },
    },
    health_flags: opts.injury
      ? { interview: { categories: ["injury"], matched: ["injury"], excerpt: opts.injury } }
      : {},
  });

  const { data: req } = await db
    .from("plan_requests")
    .insert({
      org_id: orgId,
      client_id: clientId,
      kind: "split",
      trigger: opts.trigger ?? "onboarding",
      status: "queued",
    })
    .select("id")
    .single();

  return { db, orgId, clientId, requestId: req!.id, cleanup: async () => {
    await db.from("orgs").delete().eq("id", orgId);
    await db.auth.admin.deleteUser(profileId);
  } };
}

test("runSplitPipeline drafts a split from a queued request", async () => {
  const { db, orgId, clientId, requestId, cleanup } = await seedSplitClient({
    daysPerWeek: 4,
    equipment: "full commercial gym",
    experience: "3 years",
  });
  try {
    const events: { splitId: string; needsAttention: boolean }[] = [];
    const res = await runSplitPipeline(db, requestId, {
      deps: fakeSplitAgents,
      onDrafted: (e) => {
        events.push({ splitId: e.splitId, needsAttention: e.needsAttention });
      },
    });
    expect(res.status).toBe("drafted");
    expect(res.splitId).toBeTruthy();
    expect(events).toHaveLength(1);

    // The draft row is written with the training payload.
    const { data: split } = await db
      .from("splits")
      .select("status, source, days, schedule, meta, version")
      .eq("id", res.splitId!)
      .single();
    expect(split!.status).toBe("draft");
    expect(split!.source).toBe("onboarding");
    expect(split!.version).toBe(1);
    expect(Array.isArray(split!.days)).toBe(true);
    expect((split!.days as unknown[]).length).toBeGreaterThan(0);
    // 4-day → schedule has 4 training weekdays.
    expect(Object.keys(split!.schedule as object)).toHaveLength(4);

    // The request is advanced.
    const { data: req } = await db.from("plan_requests").select("status").eq("id", requestId).single();
    expect(req!.status).toBe("drafted");

    // Version 2 on a re-run (superseding happens at approval, P5.3).
    const { data: req2 } = await db
      .from("plan_requests")
      .insert({ org_id: orgId, client_id: clientId, kind: "split", trigger: "manual", status: "queued" })
      .select("id")
      .single();
    const res2 = await runSplitPipeline(db, req2!.id, { deps: fakeSplitAgents });
    const { data: split2 } = await db.from("splits").select("version").eq("id", res2.splitId!).single();
    expect(split2!.version).toBe(2);
  } finally {
    await cleanup();
  }
});

test("runSplitPipeline builds an injury-safe split and records the injury tags", async () => {
  const { db, requestId, cleanup } = await seedSplitClient({
    daysPerWeek: 4,
    equipment: "full commercial gym",
    experience: "advanced",
    injury: "shoulder impingement, painful pressing overhead",
  });
  try {
    const res = await runSplitPipeline(db, requestId, { deps: fakeSplitAgents });
    expect(res.status).toBe("drafted");

    const { data: split } = await db
      .from("splits")
      .select("days, meta")
      .eq("id", res.splitId!)
      .single();
    const meta = split!.meta as { injuryTags: string[]; injuryExcluded: { id: string }[] };
    expect(meta.injuryTags).toContain("shoulder_impingement");

    // No auto-excluded exercise appears anywhere in the drafted split.
    const excludedIds = new Set(meta.injuryExcluded.map((e) => e.id));
    const days = split!.days as { exercises: { exercise_id: string }[] }[];
    for (const day of days) {
      for (const ex of day.exercises) expect(excludedIds.has(ex.exercise_id)).toBe(false);
    }
    expect(meta.injuryExcluded.length).toBeGreaterThan(0);
  } finally {
    await cleanup();
  }
});

test("runSplitPipeline rejects a non-split request", async () => {
  const { db, orgId, clientId, cleanup } = await seedSplitClient({
    daysPerWeek: 3,
    equipment: "full gym",
    experience: "beginner",
  });
  try {
    const { data: dietReq } = await db
      .from("plan_requests")
      .insert({ org_id: orgId, client_id: clientId, kind: "diet", trigger: "onboarding", status: "queued" })
      .select("id")
      .single();
    const res = await runSplitPipeline(db, dietReq!.id, { deps: fakeSplitAgents });
    expect(res.status).toBe("failed");
    expect(res.reason).toContain("not a split");
  } finally {
    await cleanup();
  }
});
