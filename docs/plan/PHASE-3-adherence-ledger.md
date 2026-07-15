# PHASE 3 — Adherence Ledger & Logging Pipelines

**Ships:** every client logging surface (meal text/photo/voice, weigh-ins, gym check-ins, working sets), the verified nutrition database, auto-miss marking, two-lens scoring, streaks/comeback mechanics, macro banking, and the timezone-correct reminder engine.
**Depends on:** P0 (schema/jobs), P1 (demo client), P2 (timezone, notification channel, intake).
**Feeds:** P4 (ledger informs monthly adjustments), P6 (every log is a thread interaction; reminders deliver via P6 channels), P7 (all dashboard data).

---

## ① Learn first (~60 min)

| Topic | Why | Where |
|---|---|---|
| USDA FoodData Central data model (foods, portions, nutrients) | You're building the verified nutrition DB — know SR Legacy vs Foundation vs Branded types | fdc.nal.usda.gov/data-documentation |
| pg_cron + pgmq on Supabase | Reminder engine + end-of-day auto-miss jobs run here | supabase.com/docs/guides/database/extensions/pg_cron |
| Timezone math pitfalls (DST, day boundaries) | "End of day" is per-client-timezone; getting this wrong corrupts the ledger | date-fns-tz docs, 20 min |
| Claude vision for food photos | Photo pipeline: propose → confirm → verified-DB numbers | claude-api skill |
| IFCT / Indian food composition | Spec's own example is rotis+dal; USDA won't cover it | search "IFCT 2017 dataset"; INDB (Indian Nutrient Databank) |

## ② Claude setup for this phase

- Skills: `feature-dev`, `superpowers:test-driven-development` (scoring + timezone logic is pure-function heavy — TDD it), `dataviz` (client-lens score displays), playwright plugin.
- **Uninterruptable config:** this is the longest grind phase — run nutrition-DB import and scoring engine as two separate `ralph-loop`s with promises "import script idempotent + spot-check queries return expected macros" and "scoring engine: all 40 unit fixtures pass". PostToolUse typecheck hook already active; add `npm test --filter=db` on packages/db changes.
- Worktree `phase-3`.

## ③ GitHub repos for this phase

- [jack-tol/usda-food-data-pipeline](https://github.com/jack-tol/usda-food-data-pipeline) — consolidate USDA FDC CSVs
- [littlebunch/fdc-api](https://github.com/littlebunch/fdc-api) — self-hosted FDC API reference
- [openfoodfacts/openfoodfacts-js](https://github.com/openfoodfacts/openfoodfacts-js) — barcode/branded lookup (MIT SDK; ODbL data — attribution required)
- [strangetom/ingredient-parser](https://github.com/strangetom/ingredient-parser) — parsing patterns reference
- [wger-project/wger](https://github.com/wger-project/wger) — ledger schema reference (AGPL — reference only, don't copy code)
- [simonoppowa/OpenNutriTracker](https://github.com/simonoppowa/OpenNutriTracker) — confirm-step UX reference

## ④ Pipeline map

```
                     ┌── 3.1 verified nutrition DB (USDA + OFF + Indian foods + org custom foods)
                     │        └─ allergen tags power packages/ai/allergens.ts (P2 built v1 — now backed by real data)
client surfaces      ▼
3.2 meal text ─▶ parse agent ─▶ candidate foods ─▶ DB-verified macros ─▶ confirm (1 tap) ─▶ meal_logs
3.2 meal photo ─▶ vision propose ─▶ same confirm path (photo stored on log)
3.2 voice note ─▶ STT ─▶ same text path
3.3 weigh-ins (set days) · gym check-in (1 tap) · working sets (pre-filled from split P5)
                     ▼
3.4 day close (per-client TZ) ─▶ auto-miss marking ─▶ 3.5 scoring (client lens + trainer lens)
                     ▼                                    ▼
3.6 reminder engine (quiet hours, fallback ladder P2) ─▶ P6 delivery
protocol context (fast windows, day types) read from active plan (P4) — stub table now
```

## ⑤ Sub-phases — copy-paste prompts

### 3.1 — Verified nutrition database

```
Read CLAUDE.md and docs/plan/PHASE-3-adherence-ledger.md §④. This is the data foundation for all macro math — no LLM arithmetic anywhere.

Complete the nutrition database in packages/db (the foods table + ~150-food starter seed already exist from P2.2 — EXTEND, don't recreate):
- Add food_aliases (food_id, alias, locale) — GIN index on name_normalized + aliases for FTS
- Import scripts (idempotent, resumable, in packages/db/scripts):
  1. USDA FDC: Foundation + SR Legacy via jack-tol/usda-food-data-pipeline approach (download CSVs, consolidate, map to our schema; skip Branded for now)
  2. Indian foods: build indian-foods-seed.json (~200 staples: rotis, dals by type, sabzis, rice dishes, paneer dishes, idli/dosa, common sweets) with macros sourced from IFCT2017/INDB published values — cite source per row; mark verified=true only where values cross-check against 2 sources
  3. Common-portion table: per food, realistic serving units ("1 roti" = 40g, "1 katori dal" = 150g) — this is what makes text logging work
- Allergen tags: map every food to the allergen taxonomy from P2 (packages/ai/allergens.ts) — dairy/nuts/tree-nuts/gluten/egg/fish/shellfish/soy/sesame; script cross-references ingredient keywords; UNVERIFIED mappings default to the SAFE side (tagged as containing)
- org_custom foods: trainers can add foods (their recipes) — allergen tags REQUIRED on creation
- searchFoods(query, locale) in packages/db: FTS + alias + trigram fallback, <50ms on 20k rows — index accordingly

Verify: import runs clean twice (idempotent); spot-check 10 known foods vs published macros in a test; "2 rotis" resolves to 80g with correct kcal. Commit: "feat(nutrition): verified food database with allergen tags".
```

### 3.2 — Meal logging (text, photo, voice)

```
Load claude-api skill. Build the meal logging pipeline (the 10-second rule governs every decision):

- Tables: meal_logs (id, org_id, client_id, logged_at, tz_date date, meal_slot enum breakfast|lunch|dinner|snack|other, items jsonb [{food_id, qty, unit, grams, kcal, p, c, f}], totals jsonb, method enum text|photo|voice, photo_path nullable, confirmed bool, raw_input text)
- Text path: client message "2 rotis, dal, salad" → mealParse agent (modelRouter 'parse', Haiku, Zod output: [{name, qty, unit}]) → resolve each against searchFoods → candidate card with per-item match + portion (best-guess pre-selected) → one tap ✓ confirms all, or tap item to adjust (portion stepper, swap match) → totals computed IN CODE from DB values
- Ambiguity rule: match confidence < threshold → show top-3 picker for that item only; never block the whole log
- Photo path: upload (Storage 'meal-photos', org-scoped) → Claude vision proposes items+portions → SAME confirm card (photo thumbnail attached to log) → DB-verified numbers only
- Voice path: audio → STT (implement provider-agnostic transcribe() — pick per current best via context7) → text path
- Unknown food: "log anyway" as unverified freeform item (kcal nullable, flagged in trainer lens) + optional org_custom food creation prompt to trainer
- Protocol context: CREATE the plans_active stub table now (P4.3 fills it on approval; one current row per client): plans_active (client_id PK, plan_id nullable, day_types jsonb, schedule jsonb weekday→day_type, meal_slots jsonb, targets jsonb, fast_window jsonb, effective_from date) — confirm card shows "against today's targets" when a row exists; clients WITHOUT an active plan log in generic mode (items + computed macros shown, no target deltas); fast-window violations noted gently, recorded factually
- Every confirmed log → events + thread message (messages table exists from P2.5 — write sender=system, kind='log_confirmation'; P6.1 adds realtime fanout later)

Speed test in CI: text path ≤ 2 taps after send; parse+resolve p95 < 3s (mock model in test, latency budget asserted on the non-AI parts). Commit: "feat(ledger): meal logging text/photo/voice with verified-DB confirm step".
```

### 3.3 — Weigh-ins, check-ins, working sets

```
Build the remaining logging surfaces (portal PWA, mobile-first):
- weigh_ins (client_id, tz_date, weight_kg, method enum prompt_reply|manual): prompted on client-chosen 3x/week schedule (default Mon/Wed/Sat from P2 intake); reply is a bare number in thread OR portal quick-entry; unit preference respected (kg/lb stored normalized)
- gym_checkins (client_id, tz_date, status enum trained|rest|missed): one-tap card at client's usual evening time; AUTO-SATISFIED if working sets were logged that day (rule in code, tested)
- workout_logs (client_id, tz_date, exercise_id, set_number, weight_kg, reps, rpe nullable): portal screen pre-filled from today's scheduled split day (CREATE the P5 stub now: splits_active(client_id PK, split_id nullable, days jsonb, schedule jsonb)); exercise_id is an unconstrained text id sourced from the splits_active jsonb until Phase 5 creates the exercises catalog (P5.3 adds the FK); big touch targets, previous-session values shown ghosted, "same as last time" one-tap per exercise
- Progress photos: monthly prompt (client-configurable weekly), front/side/back upload to Storage, progress_photos table; visible to client + trainer only
- Manual activity quick-log (v1 wearable substitute — MASTER-PLAN §3 wearables row): CREATE wearable_daily (client_id, tz_date, steps, sleep_min, source enum manual|healthkit|health_connect) + a 10-second steps/sleep quick-entry on the portal Me tab; P9.2 fills it automatically, P4.4 reads it either way
- All surfaces work offline (PWA): queue writes in IndexedDB, sync on reconnect, server dedupes by (client_id, type, tz_date, idempotency_key)

Playwright mobile viewport: each surface ≤ 10s to complete. Commit: "feat(ledger): weigh-ins, check-ins, working sets, photos".
```

### 3.4 — Day-close & auto-miss engine

```
TDD this — write the fixture suite FIRST (superpowers:test-driven-development).

Build the day-close engine:
- ledger_days (client_id, tz_date, expected jsonb {meals: [slots], weigh_in: bool, checkin: bool, sets: bool}, actual jsonb, misses jsonb, closed_at) — one row per client per day, created at local midnight by the scheduler
- Expectations derive from: active plan (meal_slots from plans_active), weigh-in schedule, split schedule (training day?), client status (paused clients = no expectations); PRE-PLAN GENERIC MODE (clients active but no approved plan yet — the P2 <24h first-log promise depends on this): expectations = ≥2 meal logs/day + intake-chosen weigh-in days, no target comparisons — flips to plan-derived automatically when plans_active fills
- Close job: pg_cron ticks every 15 min → closes days for clients whose local time passed 23:59 → anything expected-but-absent recorded as MISSED (never blank) → events fired
- Late logging: client can back-log up to 48h ("yesterday's dinner") → day reopens, recomputes, marked late=true (trainer lens shows it; client lens doesn't shame it)
- DST fixtures: client in Toronto on spring-forward day, in Kolkata (no DST), traveler whose timezone changes mid-week (profile update takes effect next day-close)
- 40-case fixture suite covering: partial logs, rest days, paused clients, late logs, TZ edge cases

Commit: "feat(ledger): timezone-correct day-close and auto-miss engine".
```

### 3.5 — Two-lens scoring, streaks, macro banking

```
Read docs/plan/ORIGINAL-SPEC.md §5 two-lens scoring rationale first. Pure functions in packages/scoring — TDD.

- Weekly adherence score (0-100): weighted components (meal logging consistency 40%, weigh-ins 15%, training compliance 30%, check-ins 15%) computed from ledger_days; weights org-configurable later (hardcode v1); score IS shown to clients (spec decision)
- Client lens (portal): current score with supportive framing bands (<50 "let's reset", 50-75 "building", >75 "locked in"), streak counter (consecutive days with all expectations met), 3-day comeback mechanic (after a break, 3 good days restores streak-visual at reduced count — exact spec: streak_display = floor(previous_streak * 0.5) + comeback_days), weekly recap card. NO red walls, no guilt copy — write the copy bank now, review with frontend-design skill
- Trainer lens (data for P7): per-client daily grid (logged/missed/late per expectation), pattern flags computed nightly (weekend faller, weigh-in avoider, logging decay slope), multi-week trend series
- Macro banking (org-level toggle, default off): clients may bank up to X kcal/day (default 150, trainer-set) into a weekly buffer spendable any day; banking arithmetic in code, shown in confirm card ("banked 120 kcal → weekend buffer 340"); weekly reset at client's Monday
- All series exposed via typed queries in packages/db for P7 charts

Fixture suite: score sensitivity (one missed meal ≠ cliff), streak/comeback math, banking edge cases (negative, over-cap). Commit: "feat(scoring): two-lens scores, streaks, comeback, macro banking".
```

### 3.6 — Reminder engine

```
Build the reminder engine (delivery via P6; queue + decisions here):
- reminder_rules (client_id, kind enum meal|weigh_in|checkin|custom, schedule jsonb, quiet_hours jsonb default 21:30-07:30 local, enabled): defaults created from P2 intake (meal times, weigh-in days)
- Scheduler: pg_cron every 5 min → due reminders → pgmq queue → delivery worker (Edge Function) → notifications table (id, client_id, kind, payload, channel push|email|in_app, status queued|sent|delivered|failed, dedupe_key)
- Decision rules (code, tested): never remind for already-logged expectations; max 3 nudges/day/client TOTAL across kinds (priority: meals > weigh-in > checkin); skip during quiet hours (defer to morning); paused clients skipped; fallback ladder from P2 (push fail/absent → email_only clients get single evening digest instead)
- Copy: personal-feeling templates in trainer voice (voice profile P1), e.g. "Coach {name}: how'd lunch go?" — template bank + light AI personalization (modelRouter 'parse' tier) with hard char limits
- Prompt history (spec §10): every sent reminder ALSO mirrors into the client's thread as a messages row (kind='reminder', sender=system — table exists from P2.5) so clients can scroll their prompt history in the portal
- Kill switch: org-level and client-level reminder pause (vacation mode) — writes to reminder_rules.enabled

Fixtures: quiet-hours deferral, 3-cap priority, already-logged suppression, vacation mode. Commit: "feat(reminders): timezone-correct reminder engine with caps".
Update PROGRESS.md: Phase 3 complete.
```

## ⑥ Definition of done → handoff

- [ ] All logging surfaces ≤10s on mobile; offline-tolerant; verified-DB numbers only (grep: no macro arithmetic outside packages/db + packages/scoring)
- [ ] "2 rotis, dal, salad" resolves correctly end-to-end; photo path lands in same confirm UX
- [ ] Day-close fixture suite green incl. DST/travel cases; misses recorded, never blank
- [ ] Scores match hand-computed fixtures; client lens copy reviewed (no shame language); comeback + banking math exact
- [ ] Reminder caps/quiet-hours/suppression proven by tests; reminders mirrored into thread history
- [ ] Demo seeder stage seedLedger implemented (3 weeks of realistic demo data generated through THIS engine's write paths)
- **Handoff to Phase 4:** ledger series + intake + style profile = everything the diet generator's monthly adjustment loop reads. plans_active stub becomes real in P4.
