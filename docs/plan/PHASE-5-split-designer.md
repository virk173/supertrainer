# PHASE 5 — Split Designer, Video Library & Progression

**Ships:** intake→draft→approval training splits in the trainer's programming style, injury-aware exercise selection, exercise video library (trainer uploads + YouTube fallback), working-set-informed monthly progression drafts, and the client training portal.
**Depends on:** P0–P4 (reuses the P4 pipeline patterns: orchestrator, coded validation, edit capture, review surface).
**Feeds:** P3 (splits_active drives set logging + gym check-in expectations), P6 (AI answers training questions against the split), P7 (progression drafts in queue).

---

## ① Learn first (~40 min)

| Topic | Why | Where |
|---|---|---|
| Volume landmarks (MEV/MAV/MRV) + progression models (linear, double progression, volume cycling) | You approve the validator rules — know what "sane programming" bounds are | 30-min read (Renaissance Periodization primers or similar) |
| Exercise data licensing | free-exercise-db is public domain; wger content is CC-BY-SA; ExerciseDB API-gated — choose redistributable sources | repo READMEs |
| YouTube embed policies (privacy-enhanced mode) | Fallback demo videos are YouTube embeds | developers.google.com/youtube/player_parameters |

## ② Claude setup for this phase

- Skills: `feature-dev`, `superpowers:test-driven-development` (progression math), `frontend-design` (workout player UX), playwright plugin.
- **Uninterruptable config:** same pattern as P4 — ralph-loop pipeline tuning with promise "10 golden training intakes pass all validators incl. injury exclusions". Reuse P4's PreToolUse guard pattern for `packages/ai/injury-exclusions.ts`.
- Worktree `phase-5`.

## ③ GitHub repos for this phase

- [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db) — 800+ public-domain exercises w/ images — PRIMARY seed (Unlicense)
- [exercemus/exercises](https://github.com/exercemus/exercises) — merged open exercise list — cross-reference
- [wger-project/wger](https://github.com/wger-project/wger) — schema/muscle-mapping reference (AGPL/CC-BY-SA — reference, don't bundle)
- [astashov/liftosaur](https://github.com/astashov/liftosaur) — progression DSL — the best reference for progression-rule modeling
- [anthropics/claude-agent-sdk-typescript](https://github.com/anthropics/claude-agent-sdk-typescript) — pipeline (already in use)

## ④ Pipeline map

> Design note: as in P4, the spec's "research agent" is replaced by deterministic evidence — volume/balance bounds live in the coded validator; the spec's "3–4 review loops" become 2 LLM loops + the coded validator (tighter guarantee, less latency).

```
plan_requests(kind='split', created P2.5) ← P2 intake (job, days, experience, INJURY HISTORY) | monthly progression | manual
      ▼
[0 exercise pool compiler — CODE] exercise DB filtered by: equipment access (intake),
  injury exclusion map (deterministic: injury tag → excluded movement patterns, e.g. shoulder
  impingement → overhead pressing excluded unless trainer overrides), experience gates
[1 split structure agent — LLM] split archetype from trainer style profile + availability
[2 exercise selection agent — LLM] fills days from COMPILED POOL ONLY (exercise_ids),
  sets/reps/RIR per style profile; tips per exercise
[3 validator — CODE] weekly sets per muscle within style-profile volume bounds (default 10-20),
  movement-pattern balance (push/pull ratio), no excluded exercises, rest-day spacing sane
[4 review agent — LLM] 2 fresh-eyes loops (spec asked 3-4; 2 + coded validator is tighter)
      ▼
draft → P7 queue → trainer edit (capture) → approve → splits_active (P3 reads) → portal + videos
Monthly: progression drafts from logged working sets (P3) — actual top sets, rep trends;
non-loggers fall back to monthly questionnaire (P6 check-in card).
```

## ⑤ Sub-phases — copy-paste prompts

### 5.1 — Exercise database + injury exclusion map

```
Read CLAUDE.md and docs/plan/PHASE-5-split-designer.md §④.

Build the exercise foundation in packages/db:
- exercises (id, source enum feb|org_custom, name, aliases text[], primary_muscles text[], secondary_muscles text[], movement_patterns text[] (squat|hinge|lunge|push_h|push_v|pull_h|pull_v|carry|core|isolation), equipment text[], experience_min enum beginner|intermediate|advanced, image_paths text[], instructions text[])
- Seed from yuhonas/free-exercise-db JSON (public domain — bundle images to our Storage); normalize muscle names to a fixed taxonomy; map each exercise to movement_patterns (script + manual review file for ambiguous ones)
- exercise_videos (exercise_id, org_id nullable — null = platform default, kind enum upload|youtube, storage_path/youtube_id, cue_notes text): org-specific videos override platform defaults at render time
- injury exclusion map (packages/ai/injury-exclusions.ts — deterministic, tested like allergens): injury taxonomy (shoulder_impingement, lumbar_disc, knee_acl, tennis_elbow, wrist, hip_labrum, hernia, ...) → excluded movement_patterns + excluded exercise tags + caution tags (allowed but flagged); trainer can override per client WITH explicit confirmation dialog (override logged to audit_log)
- searchExercises(query, filters) with FTS

Tests: seed idempotent; injury map excludes overhead pressing for shoulder_impingement incl. push-press edge cases; override audit trail. Commit: "feat(exercises): open exercise DB + deterministic injury exclusions".
```

### 5.2 — Split generation pipeline

```
Reuse the P4 orchestrator pattern. Build packages/ai/split-pipeline:
- Table: splits (id, org_id, client_id, version int, status enum draft|approved|superseded|archived, days jsonb [{label, exercises: [{exercise_id, sets, reps, rir, tips, video_ref}], warmup}], schedule jsonb weekday→day-label, rationale text, source enum onboarding|monthly|manual, based_on_split_id nullable, approved_at, approved_by) + RLS — mirrors the plans table shape; consumes plan_requests kind='split'
- poolCompiler (CODE): equipment ∩ experience ∩ NOT injury-excluded → candidate pool with caution flags
- splitStructureAgent(availability, styleProfile) → Zod SplitSkeleton (archetype, day labels, muscle targets per day) — trainer's split archetypes dominate
- exerciseSelectionAgent(skeleton, pool, styleProfile) → Zod SplitDraft: exercise_ids only from pool, sets×reps×RIR per style habits, per-exercise cue tips, warmup block per day (style profile pattern or sensible default)
- validator (CODE): weekly set volume per muscle within bounds (style profile or 10-20 default), push/pull weekly balance within 0.75-1.33, no consecutive-day same-muscle heavy overlap, all ids in pool; bounded retry with structured errors (max 2) then needs_attention
- reviewAgent ×2 loops → structured critique for trainer
- Golden fixtures (10): 3-day beginner home-equipment, 6-day advanced, shoulder-injury push day, knee-injury lower day, 2-day minimalist, etc. — CI with mocked responses + live eval script, Langfuse traces

Commit: "feat(split-pipeline): style-driven generation with coded validation".
```

### 5.3 — Trainer review surface + video library

```
Build /trainer/splits/[id]/review (mirror P4.3 patterns):
- Day-by-day editor: swap exercise (searchExercises typeahead filtered to client's pool — pool violations impossible in UI), adjust sets/reps/RIR steppers, reorder days/exercises (drag), add note per exercise; validator re-runs live (volume meter per muscle updates as they edit)
- Injury banner: client's injuries + what was auto-excluded + override path (confirmation + audit)
- Edit capture → same style-learning loop as P4 (draft_edits with entity_type='split', entity_id=split id — schema already supports it from P4.3; edit_kind values map: swap=exercise swap, resize=sets/reps change, add/remove=exercise, structure=day reorder)
- Video library manager at /trainer/library: per exercise — upload demo (Storage, 100MB cap, mp4/mov) OR paste YouTube link (privacy-enhanced embed); coverage meter ("your library covers 34/48 exercises in your active programs" — the switching-cost nudge from ORIGINAL-SPEC §7); bulk "request videos later" default = platform images + instructions
- Approve → splits_active upserted (stub created in P3.3 — fill split_id, days with exercise details+video refs, schedule) + add the workout_logs.exercise_id FK to exercises now that the catalog exists (P3.3 note) → P3 set-logging pre-fill now real → client notified (P6)

Playwright: edit flow, volume meter reactivity, video override precedence (org > platform). Commit: "feat(splits): review surface + video library".
```

### 5.4 — Client training portal + progression loop

```
Build the client side + monthly progression:
- /portal/train: today's session player — exercise cards (video/image, cues, target sets×reps×RIR, last-session ghosts from P3 workout_logs), inline set logging (the P3 surface embedded), rest timer (configurable, notification at end), session complete → gym check-in auto-satisfied (P3 rule), "swap for alternative" shows pool-valid alternates (client request → trainer approval unless trainer enabled auto-swap list)
- Progression drafts (monthly, alongside P4 renewals): progressionContext (CODE) from P3 workout_logs — per exercise: top-set trend, rep-velocity across month, stall detection (3 sessions no progress); progressionAgent applies TRAINER'S progression style (load/volume/rotation from style profile) → draft changes per exercise with reasoning ("bench stalled 3 sessions → deload 10% and rebuild" if that's their pattern); validator bounds jumps (≤10% load increase, volume within landmarks); non-logging clients → questionnaire check-in card (P6) feeds a conservative draft
- Batch API nightly; drafts → P7 queue with per-exercise diff view

Fixtures: progressing/stalling/regressing/absent data cases per progression style. Commit: "feat(training): client portal + progression loop".
Update PROGRESS.md: Phase 5 complete.
```

## ⑥ Definition of done → handoff

- [ ] 10 golden intakes → valid splits; injury exclusions hold under property tests; overrides audited
- [ ] Volume/balance validation coded; no LLM-invented exercises possible (ids constrained to pool at type level)
- [ ] Trainer edit→approve <5 min; edits captured to style learning; video coverage meter nudging
- [ ] Client session player works offline (P3 queue); check-in auto-satisfaction verified
- [ ] Progression drafts sane on all fixture trajectories; demo seeder stage seedSplit implemented (active split + 3 weeks of logs through THIS system)
- **Handoff to Phase 6:** every plan/split/progression event now generates client-facing moments — Phase 6 builds the channel they all deliver through, and the AI layer that talks about them in the trainer's voice.
