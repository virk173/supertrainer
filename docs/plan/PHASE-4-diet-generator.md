# PHASE 4 — Diet Plan Generator (Multi-Agent Pipeline)

**Ships:** the intake→draft→trainer-approval diet pipeline in the trainer's methodology: coded TDEE/macro math, deterministic allergen blocking, 2 plan versions, fasting/carb-cycling modules, versioned monthly adjustments informed by the ledger, grocery lists, branded PDFs.
**Depends on:** P0 (packages/ai), P1 (style profiles), P2 (intake, plan_requests), P3 (nutrition DB, ledger).
**Feeds:** P3 (plans_active targets/day types/fast windows become real), P6 (AI answers "can I eat out?" against the plan), P7 (drafts land in review queue).

---

## ① Learn first (~50 min)

| Topic | Why | Where |
|---|---|---|
| TDEE equations (Mifflin-St Jeor, Katch-McArdle) + activity multipliers | The calculation module is YOURS to verify — the LLM never does this math | any evidence-based source; 20 min |
| Claude Agent SDK subagent orchestration | The 5-agent pipeline runs on this | anthropics/claude-agent-sdk-typescript docs |
| Prompt caching + Batch API | Monthly adjustment drafts for all clients = nightly batch at 50% cost | claude-api skill |
| Langfuse evals on pipelines | Plan quality regression detection before trainers see it | langfuse.com/docs/evals |

## ② Claude setup for this phase

- Skills: `claude-api` (before ANY pipeline code), `feature-dev`, `superpowers:test-driven-development` (calculation module), `code-review` before merge (this phase carries the liability).
- **Uninterruptable config:** ralph-loop the agent-pipeline tuning with promise "all 12 golden-intake fixtures produce plans passing every validator". Add PreToolUse deny-hook on edits to `packages/ai/allergens.ts` without running its test file in the same session (protect the extinction-level component).
- Worktree `phase-4`.

## ③ GitHub repos for this phase

- [anthropics/claude-agent-sdk-typescript](https://github.com/anthropics/claude-agent-sdk-typescript) — pipeline orchestration + structured outputs
- [anthropics/claude-cookbooks](https://github.com/anthropics/claude-cookbooks) — multi-agent patterns (orchestrator-workers)
- [BoundaryML/baml](https://github.com/BoundaryML/baml) — schema-aligned parsing if Zod-retry proves flaky
- [diegomura/react-pdf](https://github.com/diegomura/react-pdf) — branded plan PDFs
- [pdfme/pdfme](https://github.com/pdfme/pdfme) — if trainers want template customization later

## ④ Pipeline map

> Design note: the spec's "research agent" (§6 step 2) is deliberately replaced by deterministic components — evidence-based bounds live in the coded calculation module and validator. An LLM "research" step added latency and unverifiable claims; the evidence is encoded once, in code, reviewed by you.

```
plan_requests (created P2.5; triggers: new client | monthly renewal | trainer manual)
      ▼
[0 constraint compiler — CODE, not LLM]
  intake + allergens → hard constraints; allergen-filtered food pool from nutrition DB (P3)
      ▼
[1 calculation module — CODE] TDEE (Mifflin-St Jeor default, trainer-overridable activity factor)
  → kcal target (goal rate bounded: cut ≤0.75%/wk BW, bulk ≤0.5%) → macro split (style profile defaults,
  protein floor 1.6g/kg) → per-day-type targets if carb cycling → fast window if IF protocol
      ▼
[2 structure agent — LLM] meal skeleton per day type in trainer's structure (slots, timing, cuisine)
[3 recipe agent — LLM] fills skeleton from ALLERGEN-FILTERED pool only, food_ids + grams
  → ×2 plan versions (choice increases adherence)
      ▼
[4 validator — CODE] recompute all macros from DB; assert |target−actual| ≤ 3% kcal, ≤ 5g protein;
  assert zero allergen tags; assert food_ids exist; FAIL → bounded retry with error feedback (max 2)
[5 review agent — LLM] taste/practicality/style-match critique → structured notes for trainer
      ▼
draft (status=draft) → P7 review queue → trainer edits (EVERY edit captured → style learning P1)
→ approve → plans_active updated (P3 reads targets) → portal render + branded PDF → client notified (P6)
Monthly: renewal job reads ledger adherence + weight trend + wearables → adjustment proposal with
stated reasoning → same pipeline → same approval gate.
```

## ⑤ Sub-phases — copy-paste prompts

### 4.1 — Plan schema + calculation module (pure code)

```
Read CLAUDE.md rule 4 (no LLM arithmetic) and docs/plan/PHASE-4-diet-generator.md §④. TDD — fixtures first.

Build in packages/nutrition-engine (new package, zero AI imports):
- Tables: plans (id, org_id, client_id, version int, status enum draft|approved|superseded|archived, protocol jsonb {type: standard|if_16_8|carb_cycle, config}, day_types jsonb [{name, kcal, protein_g, carbs_g, fat_g, meal_slots}], content jsonb (filled by 4.2), rationale text, source enum onboarding|monthly|manual, based_on_plan_id nullable, approved_at, approved_by); plan_requests already exists from P2.5 — consume rows with kind='diet' (mark running/drafted/failed as the pipeline progresses)
- calculateTargets(intake, styleDefaults, override?) → {tdee, kcal, macros, dayTypes[]}: Mifflin-St Jeor; activity multipliers 1.2-1.9 mapped from job type + training days; goal rate bounds (cut max 0.75% BW/week, bulk max 0.5%); protein floor 1.6g/kg (style profile may raise, never lower below 1.2 safety floor); carb-cycle distribution math (high/med/low day kcal deltas sum to weekly target); IF window validation (≥8h eating window unless trainer explicitly overrides)
- compileConstraints(intake) → {allergenExcludedFoodIds (from P3 tags — the DETERMINISTIC block), dislikes, dietaryPattern, cuisineWeights, mealsPerDay, cookingTimeBudget}
- 15+ fixture cases: male/female, cut/bulk/recomp, sedentary/active, vegan+allergy combos, carb-cycle weekly-sum property test, absurd-input guards (age<16 → reject to trainer, BW goals beyond bounds → clamp+flag)

Commit: "feat(nutrition-engine): coded calculation + constraint compiler".
```

### 4.2 — The agent pipeline

```
Load claude-api skill. Read docs/plan/PHASE-4-diet-generator.md §④ pipeline map — implement exactly that shape.

Build in packages/ai/diet-pipeline:
- structureAgent(targets, styleProfile, constraints) → Zod DaySkeleton[] (meal slots, timing, cuisine intents per day type) — trainer's meal structure from style profile is the dominant instruction; prompt-cache the style block
- recipeAgent(skeleton, foodPool) → Zod PlannedMeal[]: SELECTS ONLY from the injected allergen-filtered food pool (food_id + grams); generates 2 distinct plan versions (different food rotations, same targets); includes 1-line prep notes per meal
- validator (CODE, in nutrition-engine): recompute macros from DB by food_id; assertions per §④; on failure re-invoke recipeAgent once with structured error ("day 2 protein 143g vs target 160g; replace or resize items"); second failure → mark draft needs_attention with validator report attached
- reviewAgent(plan, styleProfile) → structured critique {styleMatchScore, practicalityFlags[], varietyNotes} attached to draft for the trainer
- Orchestrator: runPipeline(plan_request_id) — Agent SDK, sequential with typed handoffs, full Langfuse trace (one trace per plan, spans per agent, cost tagged)
- Protocol modules: IF → skeleton constrained to window + fasting counter config emitted; carb-cycle → per-day-type generation (P3 day types)
- Golden fixtures: 12 intakes (incl. vegan+nut-allergy, Indian cuisine preference, IF+carb-cycle combined, 1200-kcal small female cut — hardest case) → all must pass validator with zero allergen hits; wire as Langfuse eval dataset + CI job (mocked model responses for CI determinism, live eval script for manual runs)

Commit: "feat(diet-pipeline): multi-agent generation with coded validation".
```

### 4.3 — Trainer review & edit surface (queue integration)

```
Build the plan review surface (full queue UI is P7; this is the plan editor it opens):
- /trainer/plans/[id]/review: two-version side-by-side; per-meal editing (swap food via searchFoods typeahead, portion stepper, add/remove meal, regenerate-this-meal button that re-runs recipeAgent for one slot); LIVE macro recompute in code on every edit with target-delta bar; validator re-runs on save
- Review agent critique panel + wearable/ledger context sidebar (weight trend sparkline, adherence %, avg logged kcal vs plan — from P3 queries)
- EDIT CAPTURE (the learning loop, MASTER-PLAN §4.2): every trainer edit persists (draft_edits: id, org_id, entity_type enum plan|split|reply, entity_id, path, before, after, edit_kind enum swap|resize|add|remove|structure|rewrite — P5/P6 reuse this table) → nightly batch job distills patterns ("always swaps oats→poha for Indian-pref clients") into style_exemplars + profile field updates (proposals; auto-applied at confidence, surfaced in trainer settings as "learned preferences" — trainer can delete any); the SAME nightly job generates embeddings for new style_exemplars rows (pick the current best embedding model via context7; store in the pgvector column — P6.4's similarity retrieval depends on this)
- Approve action: status=approved, plans_active row upserted (one current row per client — day_types, weekday schedule, meal_slots, targets, fast_window, effective_from; schema created in P3.2), event fired, client notification queued (P6), supersedes previous plan version
- Reject-with-note: back to pipeline with trainer note injected as instruction

Zero-edit-rate metric: log (plan_id, edit_count) to Langfuse on approve. Commit: "feat(plans): trainer review/edit with edit capture".
```

### 4.4 — Monthly adjustment loop

```
Build the versioned monthly adjustment (the compounding-value loop):
- Renewal scheduler: pg_cron daily → clients whose plan is ≥28 days old (or trainer-set cycle) → plan_request(trigger=monthly)
- Adjustment context compiler (CODE): last plan + ledger summary (adherence %, avg logged kcal/protein, weigh-in trend slope, training compliance) + wearable summary if present (avg steps/sleep from wearable_daily — created in P3.3 with the manual quick-log filling it in v1; P9.2 automates it) → AdjustmentContext
- Adjustment logic (CODE, trainer-visible reasoning): weight-change vs expected → TDEE re-estimate (adaptive: actual trend beats formula); rules: stall on cut + high adherence → −5-10% kcal OR +step target (present both options); poor adherence → DON'T cut harder, propose simplification (fewer meals, more repeats); rapid loss → raise kcal. Each rule emits a plain-English reason string
- Pipeline runs with AdjustmentContext injected; draft carries "proposed changes + why" diff panel vs previous plan (side-by-side in 4.3 UI)
- Runs via Batch API nightly (claude-api skill batch section) — cost tagged in Langfuse

Fixtures: stall/high-adherence, stall/low-adherence, over-rate loss, maintenance hold. Commit: "feat(plans): ledger-informed monthly adjustments".
```

### 4.5 — Client delivery: portal plan, grocery list, PDFs, fasting counter

```
Build client-facing plan delivery (portal, mobile-first, org-branded):
- /portal/plan: today's meals (day-type aware) with tap-to-log integration (P3 meal confirm pre-filled from planned meal — the "ate as planned" one-tap), full week view, swap-suggestions display, macro targets header
- Grocery list generator (CODE): aggregate approved plan's foods × 7 days → categorized list (produce/dairy/pantry/protein) with quantities; check-off UX; regenerate on plan change; "meal-prep mode" groups by cook-session (batch-cookable meals flagged by recipe agent notes)
- Fasting counter (IF clients): portal widget + optional push at window open/close; start/end check-ins write to ledger (P3 events)
- Branded PDF (react-pdf): trainer logo/colors, plan tables per day type, prep notes, neutral footer ("prepared based on the dietary information you provided" — ORIGINAL-SPEC §6 legal) + trainer social links (spec §11), grocery appendix; generated on approve, stored, delivered in-app + email copy (Resend)
- Client plan-feedback loop: thumbs per meal after logging ("loved it / it's ok / not for me") → stored → next monthly adjustment context includes meal-level sentiment

Playwright: plan → grocery list math correct (7× aggregation), PDF snapshot renders, IF counter state machine. Commit: "feat(plans): client delivery, grocery lists, PDFs, fasting counter".
Update PROGRESS.md: Phase 4 complete.
```

## ⑥ Definition of done → handoff

- [ ] 12 golden intakes → valid plans, zero allergen hits (property-test the filter against full taxonomy again HERE, post-integration), macros within tolerance — all in CI
- [ ] Macro math provably code-only (grep/lint rule: no arithmetic on nutrient fields outside nutrition-engine)
- [ ] Trainer can review→edit→approve in <5 min for a typical draft; every edit captured; zero-edit rate on Langfuse dashboard
- [ ] Monthly loop produces a sensible adjustment with plain-English reasoning on all fixtures
- [ ] plans_active feeds P3 (targets in confirm cards work end-to-end); grocery list + PDF + fasting counter live
- [ ] Demo seeder stage seedPlans implemented: demo client has an approved plan generated through THIS pipeline
- **Handoff to Phase 5:** same pipeline pattern (style → agents → coded validation → queue → approval) is now proven; Phase 5 reuses the orchestrator, edit-capture, and review-surface patterns for training splits.
