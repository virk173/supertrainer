import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { runSplitPipeline } from "../../lib/splits/run";
import {
  applySplitEditAndCapture,
  approveSplit,
  rejectSplit,
  setExerciseVideo,
} from "../../lib/splits/mutations";
import { fakeSplitAgents } from "./split-fakes";
import { serviceClient } from "./helpers";

// DB coverage of the split review mutations: edit→capture+revalidate, approve→
// splits_active (with catalog names + FK'd exercise ids) + supersede + notify,
// reject→requeue, video override. Mirrors the P4.3 plan-mutation tests.

async function seedDraftedSplit() {
  const db = serviceClient();
  const orgId = randomUUID();
  await db.from("orgs").insert({ id: orgId, name: "Rev Org", slug: `rev-${orgId.slice(0, 8)}` });
  const { data: user } = await db.auth.admin.createUser({
    email: `rev-${orgId.slice(0, 8)}@test.local`,
    email_confirm: true,
  });
  const profileId = user!.user!.id;
  await db.from("profiles").upsert({ id: profileId, org_id: orgId, role: "owner" });
  const clientId = randomUUID();
  await db.from("clients").insert({
    id: clientId,
    org_id: orgId,
    profile_id: profileId,
    status: "active",
    source: "invite",
    intake: { goal: "build_muscle", stage_b: { training: { daysPerWeek: 4, equipmentAccess: "full gym", experience: "advanced" } } },
    health_flags: {},
  });
  const { data: req } = await db
    .from("plan_requests")
    .insert({ org_id: orgId, client_id: clientId, kind: "split", trigger: "onboarding", status: "queued" })
    .select("id")
    .single();
  const res = await runSplitPipeline(db, req!.id, { deps: fakeSplitAgents });
  return { db, orgId, clientId, profileId, splitId: res.splitId!, cleanup: async () => {
    await db.from("orgs").delete().eq("id", orgId);
    await db.auth.admin.deleteUser(profileId);
  } };
}

test("edit → captures a draft_edits row and re-validates the split", async () => {
  const { db, orgId, profileId, splitId, cleanup } = await seedDraftedSplit();
  try {
    const { data: before } = await db.from("splits").select("days").eq("id", splitId).single();
    const day = (before!.days as { label: string; exercises: { exercise_id: string }[] }[])[0];
    const target = day.exercises[0];

    const res = await applySplitEditAndCapture(db, {
      splitId,
      orgId,
      editorId: profileId,
      edit: { kind: "resize", dayLabel: day.label, exerciseId: target.exercise_id, sets: 5 },
    });
    expect(res.ok).toBe(true);
    expect(res.validation).toBeTruthy();

    const { data: edits } = await db
      .from("draft_edits")
      .select("entity_type, edit_kind, path")
      .eq("entity_id", splitId);
    expect(edits).toHaveLength(1);
    expect(edits![0].entity_type).toBe("split");
    expect(edits![0].edit_kind).toBe("resize");
  } finally {
    await cleanup();
  }
});

test("approve → splits_active (names + FK ids), supersede, split_ready notification", async () => {
  const { db, orgId, clientId, profileId, splitId, cleanup } = await seedDraftedSplit();
  try {
    // A pre-existing approved split to be superseded.
    const { data: prior } = await db
      .from("splits")
      .insert({ org_id: orgId, client_id: clientId, status: "approved", source: "onboarding", version: 0, days: [], schedule: {} })
      .select("id")
      .single();

    const res = await approveSplit(db, { splitId, orgId, approverId: profileId });
    expect(res.ok).toBe(true);
    expect(res.clientId).toBe(clientId);

    const { data: split } = await db.from("splits").select("status, approved_by").eq("id", splitId).single();
    expect(split!.status).toBe("approved");
    expect(split!.approved_by).toBe(profileId);

    // Prior approved split superseded.
    const { data: old } = await db.from("splits").select("status").eq("id", prior!.id).single();
    expect(old!.status).toBe("superseded");

    // splits_active upserted with the day map + catalog names.
    const { data: active } = await db.from("splits_active").select("split_id, days, schedule").eq("client_id", clientId).single();
    expect(active!.split_id).toBe(splitId);
    const activeDays = active!.days as Record<string, { name: string; exercise_id: string }[]>;
    const firstDay = Object.values(activeDays)[0];
    expect(firstDay.length).toBeGreaterThan(0);
    expect(firstDay[0].name).not.toBe(firstDay[0].exercise_id); // resolved to a real name

    // A workout_log FK'd to one of the split's exercises inserts cleanly (the FK
    // is live and the ids are real catalog rows).
    const { error: logErr } = await db.from("workout_logs").insert({
      org_id: orgId,
      client_id: clientId,
      tz_date: "2026-07-23",
      exercise_id: firstDay[0].exercise_id,
      exercise_name: firstDay[0].name,
      set_number: 1,
      weight_kg: 60,
      reps: 8,
    });
    expect(logErr).toBeNull();

    // split_ready notification queued.
    const { data: notifs } = await db
      .from("notifications")
      .select("kind, dedupe_key")
      .eq("client_id", clientId)
      .eq("kind", "split_ready");
    expect(notifs).toHaveLength(1);
  } finally {
    await cleanup();
  }
});

test("reject → archives and re-queues a split request", async () => {
  const { db, orgId, splitId, cleanup } = await seedDraftedSplit();
  try {
    const res = await rejectSplit(db, { splitId, orgId, note: "swap the leg day to a hinge focus" });
    expect(res.ok).toBe(true);
    const { data: split } = await db.from("splits").select("status, meta").eq("id", splitId).single();
    expect(split!.status).toBe("archived");
    expect((split!.meta as { rejectNote: string }).rejectNote).toContain("hinge");
    const { data: req } = await db
      .from("plan_requests")
      .select("status")
      .eq("id", res.planRequestId!)
      .single();
    expect(req!.status).toBe("queued");
  } finally {
    await cleanup();
  }
});

test("setExerciseVideo stores an org override that wins over any platform default", async () => {
  const { db, orgId, cleanup } = await seedDraftedSplit();
  try {
    const { data: ex } = await db.from("exercises").select("id").eq("source", "feb").limit(1).single();
    // A platform default (service role) + an org override for the same exercise.
    await db.from("exercise_videos").insert({ exercise_id: ex!.id, org_id: null, kind: "youtube", youtube_id: "platformdef" });
    const set = await setExerciseVideo(db, { orgId, exerciseId: ex!.id, kind: "youtube", youtubeId: "orgclip", cueNotes: "elbows in" });
    expect(set.ok).toBe(true);

    const { data: rows } = await db
      .from("exercise_videos")
      .select("org_id, youtube_id")
      .eq("exercise_id", ex!.id)
      .order("org_id", { nullsFirst: true });
    expect(rows).toHaveLength(2); // platform default + org override coexist
    expect(rows!.some((r) => r.org_id === orgId && r.youtube_id === "orgclip")).toBe(true);
  } finally {
    await cleanup();
  }
});
