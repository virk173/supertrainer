import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { generateSplit, GOLDEN_SPLIT_INTAKES } from "@supertrainer/ai";
import { resolveInjuryTags } from "@supertrainer/ai";

import { compileSplitPool } from "../../lib/splits/pool";
import { fakeSplitAgents } from "./split-fakes";
import { serviceClient } from "./helpers";

// The 10 golden split intakes run through the REAL seeded exercise pool with the
// deterministic injected agents (no model). Proves — across beginner→advanced,
// 2→6 days, home→gym, and the injury cases — that the pipeline always emits an
// injury-safe, in-pool split, and that the equipped cases produce a fully-valid
// draft. Mirrors diet-fixtures.spec.ts (the 12-fixture allergen property test).

const ORG = randomUUID(); // globals (org_id null) are visible regardless of org

// Fixtures that may legitimately land on needs_attention rather than a clean
// draft: a shoulder-impingement client loses overhead pressing (so push volume
// drops below the pull side — the trainer decides how to rebalance), and a
// bodyweight-only pool is thin for some muscles. Every OTHER fixture must
// produce a fully-valid draft.
const MAY_NEED_ATTENTION = new Set([
  "4-day upper/lower, full gym, shoulder impingement",
  "3-day bodyweight-only, no equipment, lose fat",
]);

for (const golden of GOLDEN_SPLIT_INTAKES) {
  test(`golden split: ${golden.name}`, async () => {
    const db = serviceClient();
    const { intake } = golden;

    const { pool, excluded } = await compileSplitPool(
      db,
      ORG,
      intake.equipment,
      intake.experience,
      intake.injuries,
    );
    expect(pool.length).toBeGreaterThan(0);
    const poolIds = new Set(pool.map((p) => p.id));
    const excludedIds = new Set(excluded.map((e) => e.id));
    const patternOf = new Map(pool.map((p) => [p.id, p.movement_patterns]));

    const res = await generateSplit(
      {
        availability: { daysPerWeek: intake.daysPerWeek },
        experience: intake.experience,
        goal: intake.goal,
        styleProfile: golden.styleProfile,
        pool,
      },
      fakeSplitAgents,
    );

    // SAFETY INVARIANTS (must hold for every fixture):
    expect(res.days.length).toBeGreaterThan(0);
    for (const day of res.days) {
      for (const ex of day.exercises) {
        // Every prescribed exercise is in the compiled pool (validate-after)…
        expect(poolIds.has(ex.exercise_id)).toBe(true);
        // …and none is an injury-auto-excluded exercise.
        expect(excludedIds.has(ex.exercise_id)).toBe(false);
      }
    }

    // Injury-specific: a shoulder-impingement client never gets overhead pressing.
    if (resolveInjuryTags(intake.injuries).has("shoulder_impingement")) {
      for (const day of res.days) {
        for (const ex of day.exercises) {
          expect(patternOf.get(ex.exercise_id) ?? []).not.toContain("push_v");
        }
      }
    }

    // Equipped, unrestricted fixtures must produce a fully-valid, balanced draft.
    if (!MAY_NEED_ATTENTION.has(golden.name)) {
      expect(res.status).toBe("draft");
      expect(res.validation.ok).toBe(true);
      expect(res.validation.balance.ratio).toBeGreaterThanOrEqual(0.75);
      expect(res.validation.balance.ratio).toBeLessThanOrEqual(1.33);
    }
  });
}
