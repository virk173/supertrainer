# Audit baseline — Phases 0–6 (Native Messaging & AI Communication Layer shipped)

**Baseline commit:** `7b74f9f` (main, 2026-07-24) — "Phase 6 — Native Messaging Platform & AI Communication Layer (#18)". (Prior baselines: `fb74b09` Phase 5 Training Split Designer #16; `7bd1aeb` Phase 4 Diet Plan Generator #14; `2baacaf` Phase 3 Adherence Ledger #10; `8748b59` audit PROPOSE-ONLY features #8; `1e63677` pre–Phase 3 hardening #7.)

Phase 6 (the whole Native Messaging Platform & AI Communication Layer: the realtime client↔coach thread — `messages` stub extended in place with a kind enum, threaded replies, delivery/read receipts, `client_tag` offline-dedupe, FTS, and the `supabase_realtime` publication; the push delivery ladder — `web-push` sender → push→4h-badge→20:00-email-digest, dead-endpoint pruning → auto-downgrade → snippet-only digest; the **fail-closed** `packages/ai/comms-router` — two-gate escalation (deterministic keyword floor ∪ Haiku classifier, EITHER fires = escalation, confidence < 0.8 → conversational never autonomous, Hinglish terms) that absorbed the P2.5 `escalation.ts`, plus the `escalations` queue + holding line + self-harm crisis card; the drafted-reply queue + autonomous lane — coded `remainingMacros` with validate-after grounding, `packages/ai/reply-engine`, the lane dispatcher wired into the send path, and `/trainer/queue`; and the smart check-in cards + weekly recap + morning digest) shipped green (pgTAP 227 → 267; new `packages/ai/comms-router` + `packages/ai/reply-engine`; 4 new tables — `escalations`, `drafts`, `check_in_responses` — + extended `messages`/`notifications`/`clients`; 5 new migrations) after a **high-effort code review** whose 6 findings were all fixed and re-verified (weekly-recap/demo cards counting toward the check-in cap, a digest terminalized before the email sent, a card-answer dedup gap, a double-counted renewal, a mislabeled recap card, and un-debounced read receipts). CI merge gate is fully deterministic (injected classifier/wrap/draft agents; the live model runs only in `eval:comms` + `ANTHROPIC_API_KEY`-gated e2e). So this baseline now covers **everything through PR #18**; future audits diff from here (start from `7b74f9f` for Phase 7).

Phase 5 (the whole Training Split Designer: `packages/training-engine` coded volume/balance/progression math + validator + balanced fallback skeletons; the open exercise catalog — 873 free-exercise-db exercises, deterministic movement-pattern classifier — with fail-closed `injury-exclusions` + audited overrides; the multi-agent `split-pipeline` with coded validation and a 2-tier deterministic fallback; trainer review/edit + edit-capture + approve→splits_active/supersede; the video library + `workout_logs`→`exercises` FK; the client `/portal/train` session player; the coded monthly progression loop) shipped green (pgTAP 198 → 227; new `packages/training-engine`; 3 new tables — `exercises`, `exercise_videos`, `splits` — + the `workout_logs`→`exercises` FK) after a **high-effort code review** whose 5 findings were all fixed and re-verified (a stale review volume-meter after edits, a progression stall preempting top-of-range load, a notification re-approve dedupe throw, a "home gym"→full-gym over-grant, and duplicated volume math). So this baseline now covers **everything through PR #16**; future audits diff from here (start from `fb74b09` for Phase 6).

Phase 4 (the whole Diet Plan Generator: `packages/nutrition-engine` coded TDEE/macro engine + validator + fitPortions; the multi-agent `diet-pipeline` with coded validation and a deterministic fallback; trainer review/edit + edit-capture + approve→plans_active/supersede; the ledger-informed monthly adjustment loop; client delivery — portal plan, grocery list, react-pdf, fasting counter) shipped green (pgTAP 183 → 198; new `packages/nutrition-engine`; 2 new tables — `plans`, `draft_edits`) after a **high-effort code review** whose 5 findings were all fixed and re-verified (a carb-cycle adjustment-anchor bug, a wrap-around fasting-window bug, reject-note-not-injected, an N+1 in the renewal scheduler, and dead code). Covered everything through PR #14.

Phase 3 (the whole Adherence Ledger: verified nutrition DB, meal/photo/voice logging, weigh-ins/check-ins/working-sets/photos, timezone-correct day-close & auto-miss, two-lens scoring/streaks/comeback/banking, reminder engine) shipped green (pgTAP 124 → 183; new `packages/scoring`; ~14 new tables) after a **max-effort code review** whose findings were all fixed and re-verified (notably an allergen-tagging fail-open, a photo-bucket tenancy hole, and two feature-breaking reminder bugs).

## What this baseline means

Phases 0–2 + the Phase 2 backstops were **comprehensively audited** (deep multi-agent, adversarially verified — see `docs/audit/2026-07-21-pre-phase3-audit.md`) and **hardened**: all 14 confirmed defects (8 MUST-FIX + 6 SHOULD-FIX) plus review follow-ups were fixed, verified, merged (#7, `1e63677`), and migrated to prod.

The baseline then **advanced through the 6 audit PROPOSE-ONLY features (PO-1…PO-6, PR #8, `8748b59`)** — consent re-sign, auto client brief, lead-intent scoring, prospects view, style-strength meter, and the AI resilience layer. That PR shipped green (typecheck 4/4 · lint · pgTAP 124 · Playwright 106) after three review passes (max-effort code-review → 12 fixes; security-review → clean; a second local max-effort pass → 4 more fixes incl. a circuit-breaker probe-leak). So this baseline now covers **everything through PR #8**; future audits diff from here.

## Rule for future audits (do NOT re-burn tokens)

**Never re-audit Phases 0–2.** Every future hardening audit is **scoped to the NEW work only** — the diff since this baseline (or the phase's own added/changed files). To audit a later phase:

- Establish the diff to review: `git diff <baseline-or-prev-phase-merge>..HEAD` (start from `7b74f9f` for Phase 7), or the phase's file set. Do NOT read/scan Phases 0–6 code except where the new phase directly touches it.
- Advance this baseline after each phase's audit ships: update the "Baseline commit" above to the phase's merge commit so the next audit starts from there.

## Reusable phase-scoped audit prompt

```
COMPREHENSIVE AUDIT + REMEDIATION of the NEW work only (do NOT re-audit
Phases 0–2 — see docs/audit/AUDIT-BASELINE.md). Act as a senior full-stack team.

ORIENT: repo /Users/ranjeet/Claude Code/supertrainer. Read CLAUDE.md,
docs/plan/PROGRESS.md, docs/audit/AUDIT-BASELINE.md, and the supertrainer-*
memory. New branch: git checkout -b audit/<phase>-hardening. Docker + local
Supabase up; Anthropic credits funded.

SCOPE = ONLY the diff since the audit baseline: run
`git diff <BASELINE_COMMIT>..HEAD` (BASELINE_COMMIT from AUDIT-BASELINE.md) and
review just those changed files + the functions they touch. Do NOT scan
Phases 0–2 code except where the new work directly calls into it.

INVARIANTS (CLAUDE.md): all DB via packages/db; all AI via modelRouter(task);
no LLM arithmetic; Zod-validate every AI output; every new table ships RLS +
explicit grants + a pgTAP test; service-role bypasses RLS so cross-org
reads/writes verify org_id in code; allergen filter only DROPS foods; health
gate only ADDS flags.

PROCESS — find → adversarially verify → triage → apply → re-verify:
1. AUDIT the new diff across: correctness/errors; data-sync & cross-phase gaps;
   security (RLS/grants/tenancy, public endpoints, input validation, secrets);
   code quality; feature opportunities (PROPOSE ONLY); UI (bugs→FIX,
   redesigns→PROPOSE). Cite file:line + a concrete failure scenario each.
2. VERIFY every finding adversarially (kill false positives).
3. TRIAGE → MUST-FIX / SHOULD-FIX / PROPOSE-ONLY.
4. APPLY MUST + SHOULD, test-first, ONE change at a time. Do NOT build
   PROPOSE-ONLY. REGRESSION SAFETY: full suite green after every change
   (npm run typecheck; npm run lint; npx supabase db reset && npx supabase
   test db; cd apps/web && npm run test); revert on any regression; never
   weaken a test.
5. REVIEW: /code-review (max) + /security-review; fix Critical/Important; then
   ask me to run /code-review ultra.
6. REPORT to docs/audit/<date>-<phase>-audit.md; open a PR when green.
   After merge, update AUDIT-BASELINE.md's baseline commit to this merge.

GUARDRAILS: don't break the green build; don't auto-add features/UI redesigns;
STOP and ask before any ambiguous/product-shaped change.
```

## Notes for CI/deploy (carry-forward gotchas)

- CI (`ci.yml`) intentionally does NOT pass `ANTHROPIC_API_KEY` to the Playwright job, so live-AI e2e tests SKIP in CI (deterministic, no credit dependency). Any new e2e that needs a live turn must be gated `test.skip(!process.env.ANTHROPIC_API_KEY, ...)` AND its no-key path must still pass, or the whole job goes red in CI.
- `vercel.json` lives at `apps/web/vercel.json` (Vercel Root Directory = apps/web); Vercel Hobby caps crons at once/day.
- Prod migrations are a manual gate: Actions → "Migrate (production DB)" → Run workflow on `main`.
