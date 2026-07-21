import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "../types";

// Idempotent demo-client seeder (Phase 1.6 foundation). Every org can have one
// badged "Alex Demo" client so screens are never empty. Composed of stage
// functions: seedCore runs now; seedLedger/seedPlans/seedSplit/seedThread are
// registered no-ops that Phases 3/4/5/6 fill in with 3 weeks of realistic data
// from their own engines. Running it twice yields the same state.

export const DEMO_CLIENT_NAME = "Alex Demo";

const DEMO_INTAKE = {
  name: DEMO_CLIENT_NAME,
  email: "alex.demo@example.com",
  phone: "",
  goal: "Lose 5 kg and build a consistent logging habit",
  current_weight: "84 kg",
  height: "178 cm",
  birthday: "1992-04-18",
  dietary_preference: "Omnivore, prefers high-protein",
  allergies: "Peanuts",
  notes: "Demo client — explore every screen with realistic data.",
};

const DEMO_HEALTH_FLAGS = { allergies: ["Peanuts"] };

type Db = SupabaseClient<Database>;
interface SeedCtx {
  orgId: string;
  clientId: string;
}
type SeedStage = (supabase: Db, ctx: SeedCtx) => Promise<void>;

// Core: the client row + intake are ensured by seedDemoClient itself; this
// stage is where any additional core fixtures would live.
const seedCore: SeedStage = async () => {};

// Registered no-ops — each phase's DoD includes implementing its stage with
// data from ITS OWN engine (meal logs at 82% adherence, 2 missed weigh-ins, an
// approved diet plan, an active split, an escalation message + drafted reply).
const seedLedger: SeedStage = async () => {}; // Phase 3
const seedPlans: SeedStage = async () => {}; // Phase 4
const seedSplit: SeedStage = async () => {}; // Phase 5
const seedThread: SeedStage = async () => {}; // Phase 6

const STAGES: SeedStage[] = [seedCore, seedLedger, seedPlans, seedSplit, seedThread];

// Finds or creates the org's single demo client, refreshes its core data, then
// runs every registered stage. Returns the demo client id.
export async function seedDemoClient(supabase: Db, orgId: string): Promise<string> {
  const { data: existing } = await supabase
    .from("clients")
    .select("id")
    .eq("org_id", orgId)
    .eq("is_demo", true)
    .maybeSingle();

  let clientId = existing?.id;

  if (!clientId) {
    // Insert-or-adopt with a bounded retry. The partial-unique index on
    // clients(org_id) where is_demo (20260721120000_demo_client_unique.sql,
    // mirroring plan_requests_onboarding_unique.sql) rejects a racing second
    // insert (double-click, or seedDemo racing resetDemo) with 23505 once a
    // winner exists — we adopt the winner instead of throwing. If that winner
    // was itself deleted in the window (seedDemo racing resetDemo — the exact
    // race MF-4 targets), the adopt read misses, so we retry the insert rather
    // than 500 on a now-missing row.
    for (let attempt = 0; attempt < 3 && !clientId; attempt++) {
      const { data, error } = await supabase
        .from("clients")
        .insert({
          org_id: orgId,
          status: "active",
          source: "invite",
          is_demo: true,
          intake: DEMO_INTAKE as unknown as Json,
          health_flags: DEMO_HEALTH_FLAGS as unknown as Json,
        })
        .select("id")
        .single();
      if (!error) {
        clientId = data.id;
        break;
      }
      if (error.code !== "23505") throw error;
      const { data: winner } = await supabase
        .from("clients")
        .select("id")
        .eq("org_id", orgId)
        .eq("is_demo", true)
        .maybeSingle();
      if (winner) clientId = winner.id;
      // else: the winner was deleted in the race window — loop to retry the insert.
    }
    if (!clientId) {
      throw new Error("demo client seed failed after retries (concurrent reset?)");
    }
  } else {
    await supabase
      .from("clients")
      .update({
        status: "active",
        intake: DEMO_INTAKE as unknown as Json,
        health_flags: DEMO_HEALTH_FLAGS as unknown as Json,
      })
      .eq("id", clientId);
  }

  const ctx: SeedCtx = { orgId, clientId };
  for (const stage of STAGES) await stage(supabase, ctx);
  return clientId;
}
