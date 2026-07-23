import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import {
  searchExercises,
  recordInjuryOverride,
} from "@supertrainer/db/queries";

import { serviceClient } from "./helpers";

// DB-backed coverage of the exercise catalog + search + override audit. Uses the
// service role (RLS bypassed) — the RLS guarantees themselves are proven in
// pgTAP (rls_exercises_test.sql); here we prove the seed loaded, search ranks +
// filters correctly, and the injury-override audit trail is written with
// tenancy enforced in code.

test("free-exercise-db seed loaded as global platform exercises", async () => {
  const db = serviceClient();
  const { count, error } = await db
    .from("exercises")
    .select("*", { count: "exact", head: true })
    .is("org_id", null)
    .eq("source", "feb");
  expect(error).toBeNull();
  // 800+ public-domain exercises (the spec's PRIMARY seed).
  expect(count ?? 0).toBeGreaterThan(800);
});

test("search_exercises ranks a text query (exact/prefix > fuzzy)", async () => {
  const db = serviceClient();
  const rows = await searchExercises(db, "bench press", { limit: 5 });
  expect(rows.length).toBeGreaterThan(0);
  // A bench press is a horizontal-press movement.
  const top = rows[0];
  expect(top.name.toLowerCase()).toContain("bench press");
  expect(top.movement_patterns).toContain("push_h");
});

test("search_exercises blank query is a filter browse (pool-compiler path)", async () => {
  const db = serviceClient();
  // "Every squat-pattern barbell exercise a <=intermediate client can do."
  const rows = await searchExercises(db, "", {
    patterns: ["squat"],
    equipment: ["barbell"],
    maxExperience: "intermediate",
    limit: 50,
  });
  expect(rows.length).toBeGreaterThan(0);
  for (const r of rows) {
    expect(r.movement_patterns).toContain("squat");
    expect(r.equipment).toContain("barbell");
    expect(["beginner", "intermediate"]).toContain(r.experience_min);
    expect(r.matched_via).toBe("filter");
  }
});

test("search_exercises muscle filter narrows to the target", async () => {
  const db = serviceClient();
  const rows = await searchExercises(db, "", { muscles: ["chest"], limit: 20 });
  expect(rows.length).toBeGreaterThan(0);
  for (const r of rows) expect(r.primary_muscles).toContain("chest");
});

test("recordInjuryOverride writes an audited trail with tenancy enforced", async () => {
  const db = serviceClient();
  const orgId = randomUUID();
  const otherOrgId = randomUUID();
  const clientId = randomUUID();
  const actorId = randomUUID();

  // Minimal org + auth user + profile + client (service role, like helpers).
  await db.from("orgs").insert({ id: orgId, name: "Inj Org", slug: `inj-${orgId.slice(0, 8)}` });
  await db.from("orgs").insert({ id: otherOrgId, name: "Other", slug: `oth-${otherOrgId.slice(0, 8)}` });
  const { data: user } = await db.auth.admin.createUser({
    email: `inj-${actorId.slice(0, 8)}@test.local`,
    email_confirm: true,
  });
  const profileId = user!.user!.id;
  await db.from("profiles").upsert({ id: profileId, org_id: orgId, role: "owner" });
  await db.from("clients").insert({
    id: clientId,
    org_id: orgId,
    profile_id: null,
    status: "active",
    source: "invite",
  });

  const anyExercise = (await searchExercises(db, "bench press", { limit: 1 }))[0];

  await recordInjuryOverride(db, {
    orgId,
    actorProfileId: profileId,
    clientId,
    exerciseId: anyExercise.id,
    injuryTags: ["shoulder_impingement"],
    reason: "Client cleared by physio for horizontal press",
  });

  const { data: logs } = await db
    .from("audit_log")
    .select("action, entity_type, entity_id, payload")
    .eq("org_id", orgId)
    .eq("action", "injury_exclusion_override");
  expect(logs).toHaveLength(1);
  expect(logs![0].entity_id).toBe(anyExercise.id);
  expect((logs![0].payload as { injury_tags: string[] }).injury_tags).toEqual(["shoulder_impingement"]);

  // Tenancy: an org that does not own the client is rejected (service role
  // bypasses RLS, so the check lives in code).
  await expect(
    recordInjuryOverride(db, {
      orgId: otherOrgId,
      actorProfileId: profileId,
      clientId,
      exerciseId: anyExercise.id,
      injuryTags: ["shoulder_impingement"],
    }),
  ).rejects.toThrow(/does not belong to org/);

  // Cleanup (cascades clear profiles/clients/audit rows tied to the org).
  await db.from("orgs").delete().eq("id", orgId);
  await db.from("orgs").delete().eq("id", otherOrgId);
  await db.auth.admin.deleteUser(profileId);
});
