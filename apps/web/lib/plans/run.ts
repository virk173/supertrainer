// The DB orchestrator for the diet pipeline. Client-agnostic (takes the Supabase
// client as an argument, like lib/ledger/day-close-job) so it stays free of the
// server-only analytics/client imports and is directly testable; the production
// caller passes a service-role client + an onDrafted callback that wires
// trackServer. Service-role bypasses RLS, so every cross-row read is org-checked
// in code (the service-role tenancy rule).

import {
  flushTracing,
  generateDietPlan,
  realDietAgents,
  withPlanTrace,
  type DietPlanDeps,
  type DietProfile,
} from "@supertrainer/ai";
import type { Database, Json } from "@supertrainer/db/types";
import {
  calculateTargets,
  compileConstraints,
  parseIntake,
  proposeAdjustment,
  type AdjustmentProposal,
  type PlanProtocol,
  type StyleDefaults,
  type TargetOverride,
} from "@supertrainer/nutrition-engine";
import type { SupabaseClient } from "@supabase/supabase-js";

import { compileAdjustmentContext } from "@/lib/plans/adjust-context";
import type { DietPreference } from "@/lib/preview/diet-filter";
import { buildSafePool, poolExcludedTags, POOL_FOOD_COLUMNS, type PoolFoodRow } from "@/lib/plans/pool";

type ServiceClient = SupabaseClient<Database>;

export interface DraftedEvent {
  orgId: string;
  clientId: string;
  planId: string;
  needsAttention: boolean;
}

export interface RunDietPipelineOptions {
  deps?: DietPlanDeps;
  onDrafted?: (event: DraftedEvent) => Promise<void> | void;
}

export interface RunDietPipelineResult {
  status: "drafted" | "failed";
  planId?: string;
  reason?: string;
}

// Map the trainer's diet style profile to the numeric knobs the calculation
// engine needs (the profile carries protocol/structure, not macro numbers).
function styleDefaultsFromProfile(profile?: DietProfile): StyleDefaults {
  if (!profile) return {};
  const protocols = profile.protocols ?? [];
  let protocol: PlanProtocol | undefined;
  if (protocols.includes("intermittent_fasting") || protocols.includes("omad")) {
    protocol = { type: "if_16_8", config: { eatingHours: 8, windowStart: "12:00" } };
  } else if (protocols.includes("carb_cycling")) {
    protocol = { type: "carb_cycle", config: { high: 3, med: 1, low: 3 } };
  }
  return protocol ? { protocol } : {};
}

// runPipeline(plan_request_id) — the diet half. Reads the queued request, builds
// the coded context, runs the multi-agent pipeline under one Langfuse trace, and
// writes a draft plans row + advances the request. `deps` is injectable so tests
// drive it with a deterministic filler; production uses the live agents.
export async function runDietPipeline(
  service: ServiceClient,
  planRequestId: string,
  opts: RunDietPipelineOptions = {},
): Promise<RunDietPipelineResult> {
  const deps = opts.deps ?? realDietAgents;

  const { data: req } = await service
    .from("plan_requests")
    .select("id, org_id, client_id, kind, trigger, status")
    .eq("id", planRequestId)
    .maybeSingle();
  if (!req) return { status: "failed", reason: "plan_request not found" };
  if (req.kind !== "diet") return { status: "failed", reason: "not a diet request" };

  const fail = async (reason: string): Promise<RunDietPipelineResult> => {
    await service.from("plan_requests").update({ status: "failed" }).eq("id", req.id);
    return { status: "failed", reason };
  };

  await service.from("plan_requests").update({ status: "running" }).eq("id", req.id);

  const { data: client } = await service
    .from("clients")
    .select("id, org_id, intake, health_flags")
    .eq("id", req.client_id)
    .maybeSingle();
  // Tenancy: the service role bypasses RLS, so verify the client belongs to the
  // request's org before using any of its data.
  if (!client || client.org_id !== req.org_id) return fail("client/org mismatch");

  const parsed = parseIntake(client.intake, client.health_flags);
  if (!parsed.ok) return fail(`intake incomplete: ${parsed.issues.join("; ")}`);

  const { data: styleRow } = await service
    .from("style_profiles")
    .select("profile")
    .eq("org_id", req.org_id)
    .eq("domain", "diet")
    .eq("status", "confirmed")
    .maybeSingle();
  const styleProfile = (styleRow?.profile as DietProfile | undefined) ?? undefined;

  // Monthly renewal: the ledger-informed adjustment overrides the formula kcal
  // (adaptive TDEE) and its plain-English reason rides on the draft.
  let adjustment: AdjustmentProposal | null = null;
  let override: TargetOverride = {};
  if (req.trigger === "monthly") {
    const compiled = await compileAdjustmentContext(service, client.id, req.org_id, new Date());
    if (compiled && compiled.context.currentKcal > 0) {
      adjustment = proposeAdjustment(compiled.context);
      override = { kcal: adjustment.newKcal };
    }
  }

  const targets = calculateTargets(parsed.intake, styleDefaultsFromProfile(styleProfile), override);
  if (targets.status === "rejected") return fail(`targets rejected: ${targets.rejectReason}`);

  const constraints = compileConstraints(parsed.intake, {
    cuisineBias: styleProfile?.cuisineBias,
    bannedFoods: styleProfile?.bannedFoods,
  });

  const { data: foods } = await service
    .from("foods")
    .select(POOL_FOOD_COLUMNS)
    .or(`org_id.is.null,org_id.eq.${req.org_id}`);
  const allergens = parsed.intake.allergens ?? [];
  const diet = (parsed.intake.diet ?? "non_veg") as DietPreference;
  const pool = buildSafePool((foods ?? []) as PoolFoodRow[], allergens, diet);
  if (pool.length === 0) return fail("no safe foods for this client's constraints");
  const excludedAllergenTags = poolExcludedTags(allergens);

  const result = await withPlanTrace(
    { name: "diet-plan", metadata: { planRequestId: req.id, clientId: client.id, trigger: req.trigger } },
    () =>
      generateDietPlan(
        { targets, constraints, styleProfile, pool, excludedAllergenTags },
        deps,
      ),
  );
  await flushTracing();

  // Next version number for this client (superseding happens at approval, P4.3).
  const { data: last } = await service
    .from("plans")
    .select("version")
    .eq("client_id", client.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = (last?.version ?? 0) + 1;

  const { data: plan, error: insertError } = await service
    .from("plans")
    .insert({
      org_id: req.org_id,
      client_id: client.id,
      version,
      status: "draft",
      protocol: targets.protocol as unknown as Json,
      day_types: targets.dayTypes as unknown as Json,
      // needs_attention is a draft sub-state (the plans enum has no such value):
      // the trainer sees the flag + validator report in the review surface (P4.3).
      content: {
        versions: result.versions,
        critique: result.critique,
        fastWindow: result.fastWindow ?? null,
        needsAttention: result.status === "needs_attention",
        report: result.report,
        adjustment, // the monthly "proposed changes + why" (null for a first plan)
      } as unknown as Json,
      rationale:
        adjustment?.reason ?? (targets.flags.length ? `targets: ${targets.flags.join(", ")}` : null),
      source: req.trigger,
    })
    .select("id")
    .maybeSingle();
  if (insertError || !plan) return fail(`plan insert failed: ${insertError?.message ?? "no row"}`);

  await service.from("plan_requests").update({ status: "drafted" }).eq("id", req.id);
  await opts.onDrafted?.({
    orgId: req.org_id,
    clientId: client.id,
    planId: plan.id,
    needsAttention: result.status === "needs_attention",
  });

  return { status: "drafted", planId: plan.id };
}
