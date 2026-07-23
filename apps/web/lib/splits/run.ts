// The DB orchestrator for the split pipeline (Phase 5.2). Client-agnostic (takes
// the Supabase client as an argument, like plans/run.ts) so it stays free of the
// server-only analytics imports and is directly testable; the production caller
// passes a service-role client + an onDrafted callback that wires trackServer.
// Service-role bypasses RLS, so every cross-row read is org-checked in code (the
// service-role tenancy rule).

import {
  flushTracing,
  generateSplit,
  realSplitAgents,
  resolveInjuryTags,
  withPlanTrace,
  type SplitPlanDeps,
  type TrainingProfile,
} from "@supertrainer/ai";
import type { Database, Json } from "@supertrainer/db/types";
import { parseTrainingIntake } from "@supertrainer/training-engine";
import type { SupabaseClient } from "@supabase/supabase-js";

import { compileSplitPool } from "@/lib/splits/pool";

type ServiceClient = SupabaseClient<Database>;

export interface SplitDraftedEvent {
  orgId: string;
  clientId: string;
  splitId: string;
  needsAttention: boolean;
}

export interface RunSplitPipelineOptions {
  deps?: SplitPlanDeps;
  onDrafted?: (event: SplitDraftedEvent) => Promise<void> | void;
}

export interface RunSplitPipelineResult {
  status: "drafted" | "failed";
  splitId?: string;
  reason?: string;
}

// Minimum viable pool: below this the majors can't be covered, so we fail to the
// trainer rather than emit a threadbare split.
const MIN_POOL = 6;

export async function runSplitPipeline(
  service: ServiceClient,
  planRequestId: string,
  opts: RunSplitPipelineOptions = {},
): Promise<RunSplitPipelineResult> {
  const deps = opts.deps ?? realSplitAgents;

  const { data: req } = await service
    .from("plan_requests")
    .select("id, org_id, client_id, kind, trigger, status")
    .eq("id", planRequestId)
    .maybeSingle();
  if (!req) return { status: "failed", reason: "plan_request not found" };
  if (req.kind !== "split") return { status: "failed", reason: "not a split request" };

  const fail = async (reason: string): Promise<RunSplitPipelineResult> => {
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

  const parsed = parseTrainingIntake(client.intake, client.health_flags);
  if (!parsed.ok) return fail(`training intake incomplete: ${parsed.issues.join("; ")}`);
  const intake = parsed.intake;

  const { data: styleRow } = await service
    .from("style_profiles")
    .select("profile")
    .eq("org_id", req.org_id)
    .eq("domain", "training")
    .eq("status", "confirmed")
    .maybeSingle();
  const styleProfile = (styleRow?.profile as TrainingProfile | undefined) ?? undefined;

  const { pool, excluded, cautionCount } = await compileSplitPool(
    service,
    req.org_id,
    intake.equipment,
    intake.experience,
    intake.injuries,
  );
  if (pool.length < MIN_POOL) {
    return fail(`insufficient safe exercises for this client's equipment/injuries (${pool.length})`);
  }

  const result = await withPlanTrace(
    {
      name: "training-split",
      metadata: { planRequestId: req.id, clientId: client.id, trigger: req.trigger },
    },
    () =>
      generateSplit(
        {
          availability: { daysPerWeek: intake.daysPerWeek },
          experience: intake.experience,
          goal: intake.goal,
          styleProfile,
          pool,
        },
        deps,
      ),
  );
  await flushTracing();

  const injuryTags = [...resolveInjuryTags(intake.injuries)];

  // Next version number for this client (superseding happens at approval, P5.3).
  const { data: last } = await service
    .from("splits")
    .select("version")
    .eq("client_id", client.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = (last?.version ?? 0) + 1;

  const { data: split, error: insertError } = await service
    .from("splits")
    .insert({
      org_id: req.org_id,
      client_id: client.id,
      version,
      status: "draft",
      days: result.days as unknown as Json,
      schedule: result.schedule as unknown as Json,
      meta: {
        archetype: result.archetype,
        critique: result.critique,
        report: result.report,
        needsAttention: result.status === "needs_attention",
        autofilled: result.autofilled,
        retried: result.retried,
        warnings: result.validation.warnings,
        weeklyVolume: result.validation.weeklyVolume,
        balance: result.validation.balance,
        injuryTags,
        // What the injury filter auto-excluded, for the P5.3 banner.
        injuryExcluded: excluded,
        cautionCount,
      } as unknown as Json,
      rationale:
        result.status === "needs_attention"
          ? `Needs attention: ${result.report}`.slice(0, 500)
          : `${result.archetype} split, ${intake.daysPerWeek} days/week`,
      source: req.trigger,
    })
    .select("id")
    .maybeSingle();
  if (insertError || !split) return fail(`split insert failed: ${insertError?.message ?? "no row"}`);

  await service.from("plan_requests").update({ status: "drafted" }).eq("id", req.id);
  await opts.onDrafted?.({
    orgId: req.org_id,
    clientId: client.id,
    splitId: split.id,
    needsAttention: result.status === "needs_attention",
  });

  return { status: "drafted", splitId: split.id };
}
