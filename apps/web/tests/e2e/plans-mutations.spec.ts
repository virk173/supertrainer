import { expect, test } from "@playwright/test";

import type { Json } from "@supertrainer/db/types";

import { applyEditAndCapture, approvePlan, rejectPlan } from "@/lib/plans/mutations";
import { runEditDistillation } from "@/lib/plans/distill-job";
import { serviceClient, uniqueEmail } from "./helpers";

// Phase 4.3 — review mutations DB path (CI-safe, no model). Edit-capture with
// coded re-validation, approve → plans_active upsert + supersede + notification,
// reject → re-queue.

const planContent = {
  versions: [
    { label: "A", dayTypes: [{ name: "standard", meals: [{ slot: "breakfast", items: [{ food_id: "PLACEHOLDER", grams: 100 }] }] }] },
    { label: "B", dayTypes: [{ name: "standard", meals: [{ slot: "breakfast", items: [{ food_id: "PLACEHOLDER", grams: 100 }] }] }] },
  ],
  fastWindow: null,
  needsAttention: false,
  report: "",
};

async function seedPlan(status: "draft" | "approved" = "draft") {
  const service = serviceClient();
  const { data: user } = await service.auth.admin.createUser({ email: uniqueEmail("rev"), email_confirm: true });
  const userId = user!.user!.id;
  const { data: org } = await service.from("orgs").insert({ name: "Rev Org", slug: `rev-${userId.slice(0, 8)}` }).select("id").single();
  await service.from("profiles").insert({ id: userId, org_id: org!.id, role: "owner" });
  const { data: client } = await service
    .from("clients")
    .insert({
      org_id: org!.id, profile_id: userId, status: "active", source: "invite",
      intake: { age: 30, sex: "male", heightCm: 180, weightKg: 80, goal: "lose_fat", activity: "moderate", trainingDaysPerWeek: 4, diet: "non_veg" } as never,
    })
    .select("id")
    .single();
  // pick a real food id for the plan content so re-validation resolves it
  const { data: food } = await service.from("foods").select("id").is("org_id", null).limit(1).single();
  const content = JSON.parse(JSON.stringify(planContent).replaceAll("PLACEHOLDER", food!.id));
  const { data: plan } = await service
    .from("plans")
    .insert({
      org_id: org!.id, client_id: client!.id, status, source: "onboarding",
      day_types: [{ name: "standard", kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 60 }] as unknown as Json,
      content: content as Json,
    })
    .select("id")
    .single();
  return { service, orgId: org!.id, clientId: client!.id, planId: plan!.id, ownerId: userId, foodId: food!.id };
}

test("approve upserts plans_active, supersedes the prior plan, and queues a notification", async () => {
  const { service, orgId, clientId, planId, ownerId } = await seedPlan("draft");
  // an already-approved prior plan for the same client
  const { data: prior } = await service
    .from("plans")
    .insert({ org_id: orgId, client_id: clientId, status: "approved", source: "onboarding", day_types: [] as unknown as Json })
    .select("id")
    .single();

  const res = await approvePlan(service, { planId, orgId, approverId: ownerId, versionLabel: "A", effectiveFrom: "2026-07-23" });
  expect(res.ok).toBe(true);

  const { data: approved } = await service.from("plans").select("status, approved_by").eq("id", planId).single();
  expect(approved!.status).toBe("approved");
  expect(approved!.approved_by).toBe(ownerId);

  const { data: superseded } = await service.from("plans").select("status").eq("id", prior!.id).single();
  expect(superseded!.status).toBe("superseded");

  const { data: active } = await service.from("plans_active").select("plan_id, targets, meal_slots").eq("client_id", clientId).single();
  expect(active!.plan_id).toBe(planId);
  expect((active!.targets as Record<string, { kcal: number }>).standard.kcal).toBe(2000);
  expect(active!.meal_slots).toEqual(["breakfast"]);

  const { count } = await service.from("notifications").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("kind", "plan_ready");
  expect(count).toBe(1);
});

test("editing a draft recomputes macros and records a draft_edits row", async () => {
  const { service, orgId, planId, foodId } = await seedPlan("draft");
  const res = await applyEditAndCapture(service, {
    planId, orgId, editorId: null,
    edit: { kind: "resize", versionLabel: "A", dayType: "standard", slot: "breakfast", foodId, grams: 250 },
  });
  expect(res.ok).toBe(true);
  expect(res.validation).toBeTruthy(); // macros were recomputed in code

  const { data: plan } = await service.from("plans").select("content").eq("id", planId).single();
  const grams = (plan!.content as { versions: { dayTypes: { meals: { items: { grams: number }[] }[] }[] }[] }).versions[0].dayTypes[0].meals[0].items[0].grams;
  expect(grams).toBe(250);

  const { count } = await service.from("draft_edits").select("id", { count: "exact", head: true }).eq("entity_id", planId).eq("edit_kind", "resize");
  expect(count).toBe(1);
});

test("reject archives the plan and re-queues generation", async () => {
  const { service, orgId, planId, clientId } = await seedPlan("draft");
  const res = await rejectPlan(service, { planId, orgId, note: "more Indian breakfasts please" });
  expect(res.ok).toBe(true);
  expect(res.planRequestId).toBeTruthy();

  const { data: plan } = await service.from("plans").select("status, content").eq("id", planId).single();
  expect(plan!.status).toBe("archived");
  expect((plan!.content as { rejectNote: string }).rejectNote).toContain("Indian");

  const { data: req } = await service.from("plan_requests").select("status, trigger").eq("id", res.planRequestId!).single();
  expect(req!.status).toBe("queued");
  expect(req!.trigger).toBe("manual");
  expect(clientId).toBeTruthy();
});

test("distillation folds a recurring swap into a style exemplar and marks edits distilled", async () => {
  const service = serviceClient();
  const { data: user } = await service.auth.admin.createUser({ email: uniqueEmail("distill"), email_confirm: true });
  const { data: org } = await service.from("orgs").insert({ name: "Distill Org", slug: `dist-${user!.user!.id.slice(0, 8)}` }).select("id").single();
  const orgId = org!.id;
  const entityId = "99999999-9999-9999-9999-9999999999d1";
  for (let i = 0; i < 3; i++) {
    await service.from("draft_edits").insert({
      org_id: orgId, entity_type: "plan", entity_id: entityId, path: `p${i}`, edit_kind: "swap",
      before: { food_id: "oats" } as never, after: { food_id: "poha" } as never,
    });
  }

  const first = await runEditDistillation(service, orgId);
  expect(first.editsDistilled).toBe(3);
  expect(first.exemplarsWritten).toBe(1);

  const { data: exemplars } = await service.from("style_exemplars").select("content, source").eq("org_id", orgId);
  expect(exemplars!.length).toBe(1);
  expect(exemplars![0].source).toBe("edit_capture");
  expect(exemplars![0].content).toContain("poha");

  // Idempotent: a second run sees no undistilled edits.
  const second = await runEditDistillation(service, orgId);
  expect(second.editsDistilled).toBe(0);
  expect(second.exemplarsWritten).toBe(0);
});
