// Plan review mutations (Phase 4.3). DB cores for edit-capture, approve
// (→ plans_active + supersede), and reject (→ re-queue). Client-injected and
// org-checked in code (service role bypasses RLS); the server actions wrap these
// with the trainer session. Every macro is recomputed in code on edit (rule 4).

import { validatePlanVersion, type DayTypeTarget } from "@supertrainer/nutrition-engine";
import { parseIntake } from "@supertrainer/nutrition-engine";
import type { Database, Json } from "@supertrainer/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { DietPreference } from "@/lib/preview/diet-filter";
import { plansActivePayload } from "@/lib/plans/activate";
import { applyPlanEdit, type PlanContent, type PlanContentVersion, type PlanEdit } from "@/lib/plans/edit";
import { buildSafePool, poolExcludedTags, POOL_FOOD_COLUMNS, type PoolFoodRow } from "@/lib/plans/pool";

type ServiceClient = SupabaseClient<Database>;

async function loadPlan(service: ServiceClient, planId: string, orgId: string) {
  const { data: plan } = await service
    .from("plans")
    .select("id, org_id, client_id, day_types, protocol, content, status")
    .eq("id", planId)
    .maybeSingle();
  if (!plan || plan.org_id !== orgId) throw new Error("plan not found in org");
  return plan;
}

async function buildClientPool(service: ServiceClient, clientId: string, orgId: string) {
  const { data: client } = await service
    .from("clients")
    .select("id, org_id, intake, health_flags")
    .eq("id", clientId)
    .maybeSingle();
  if (!client || client.org_id !== orgId) throw new Error("client/org mismatch");
  const parsed = parseIntake(client.intake, client.health_flags);
  const allergens = parsed.ok ? parsed.intake.allergens ?? [] : [];
  const diet = (parsed.ok ? parsed.intake.diet ?? "non_veg" : "non_veg") as DietPreference;
  const { data: foods } = await service
    .from("foods")
    .select(POOL_FOOD_COLUMNS)
    .or(`org_id.is.null,org_id.eq.${orgId}`);
  const pool = buildSafePool((foods ?? []) as PoolFoodRow[], allergens, diet);
  return { pool, excluded: poolExcludedTags(allergens) };
}

export async function applyEditAndCapture(
  service: ServiceClient,
  p: { planId: string; orgId: string; editorId: string | null; edit: PlanEdit },
) {
  const plan = await loadPlan(service, p.planId, p.orgId);
  const { content: next, capture } = applyPlanEdit(plan.content as PlanContent, p.edit);

  // Recompute the edited version's macros in code.
  const { pool, excluded } = await buildClientPool(service, plan.client_id, p.orgId);
  const poolMap = new Map(pool.map((f) => [f.id, f]));
  const edited = next.versions.find((v) => v.label === p.edit.versionLabel);
  if (edited) {
    edited.validation = validatePlanVersion(
      { label: edited.label, dayTypes: edited.dayTypes },
      plan.day_types as unknown as DayTypeTarget[],
      poolMap,
      excluded,
    );
  }

  await service.from("plans").update({ content: next as unknown as Json }).eq("id", plan.id);
  await service.from("draft_edits").insert({
    org_id: p.orgId,
    entity_type: "plan",
    entity_id: plan.id,
    path: capture.path,
    before: capture.before as Json,
    after: capture.after as Json,
    edit_kind: capture.edit_kind,
    editor_id: p.editorId,
  });
  return { ok: true as const, validation: edited?.validation };
}

export async function approvePlan(
  service: ServiceClient,
  p: { planId: string; orgId: string; approverId: string | null; versionLabel: string; effectiveFrom: string },
) {
  const plan = await loadPlan(service, p.planId, p.orgId);
  const content = plan.content as PlanContent & {
    fastWindow?: { start: string; end: string; eatingHours: number } | null;
  };
  const version: PlanContentVersion =
    content.versions.find((v) => v.label === p.versionLabel) ?? content.versions[0];

  // Supersede any currently-approved plan for this client (one live plan).
  await service
    .from("plans")
    .update({ status: "superseded" })
    .eq("client_id", plan.client_id)
    .eq("status", "approved");

  await service
    .from("plans")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: p.approverId,
      content: { ...content, approvedVersion: version.label } as unknown as Json,
    })
    .eq("id", plan.id);

  const payload = plansActivePayload(
    plan.day_types as unknown as DayTypeTarget[],
    version,
    content.fastWindow ?? null,
    p.effectiveFrom,
  );
  await service.from("plans_active").upsert(
    {
      client_id: plan.client_id,
      org_id: plan.org_id,
      plan_id: plan.id,
      day_types: payload.day_types as unknown as Json,
      schedule: payload.schedule as unknown as Json,
      meal_slots: payload.meal_slots as unknown as Json,
      targets: payload.targets as unknown as Json,
      fast_window: payload.fast_window as unknown as Json,
      effective_from: payload.effective_from,
    },
    { onConflict: "client_id" },
  );

  // Client notification (P6 delivers it) — idempotent per plan.
  await service.from("notifications").insert({
    org_id: plan.org_id,
    client_id: plan.client_id,
    kind: "plan_ready",
    channel: "in_app",
    payload: { plan_id: plan.id } as unknown as Json,
    dedupe_key: `${plan.client_id}:plan_ready:${plan.id}`,
  });

  // Zero-edit-rate metric: how many edits the trainer made before approving.
  const { count } = await service
    .from("draft_edits")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", "plan")
    .eq("entity_id", plan.id);

  return { ok: true as const, clientId: plan.client_id, editCount: count ?? 0 };
}

export async function rejectPlan(
  service: ServiceClient,
  p: { planId: string; orgId: string; note: string },
) {
  const plan = await loadPlan(service, p.planId, p.orgId);
  await service
    .from("plans")
    .update({ status: "archived", content: { ...(plan.content as object), rejectNote: p.note } as unknown as Json })
    .eq("id", plan.id);
  // Re-queue generation (the note is stored on the archived plan; the pipeline
  // reads the latest reject note as an instruction — P4.4 wiring).
  const { data: req } = await service
    .from("plan_requests")
    .insert({ org_id: plan.org_id, client_id: plan.client_id, kind: "diet", trigger: "manual", status: "queued" })
    .select("id")
    .maybeSingle();
  return { ok: true as const, planRequestId: req?.id };
}
