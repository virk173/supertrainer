# Pre–Phase 3 comprehensive audit + remediation — run prompt

Paste the block below to launch the audit (after `/clear`, or now). Locked decisions:
fix defects automatically (verified, regression-safe); features + UI redesigns are
PROPOSE-ONLY; deep multi-agent workflow; review = `/code-review` (max) + `/security-review`,
then pause for the user to run `/code-review ultra`.

---

```
COMPREHENSIVE AUDIT + REMEDIATION — supertrainer (Phases 0–2 + Phase 2 backstops,
all shipped to main). Act as a senior full-stack engineering team doing a
pre–Phase 3 hardening pass.

DECISIONS (locked): fix defects automatically (verified, regression-safe);
features + UI redesigns are PROPOSE-ONLY (I approve later); run as a DEEP
MULTI-AGENT workflow; formal review = /code-review (max effort) + /security-review,
then pause for me to run /code-review ultra.

EXECUTION: run this as a multi-agent workflow — fan out parallel auditors per
(dimension × subsystem), adversarially verify EVERY finding with independent
refuters (keep only CONFIRMED), then pipeline confirmed findings into the apply
stage. (Launch with "use a workflow" / ultracode for the full treatment.)

ORIENT FIRST: repo /Users/ranjeet/Claude Code/supertrainer. Read CLAUDE.md,
docs/plan/PROGRESS.md, and the supertrainer-* memory notes. Confirm clean git
state. New branch: git checkout -b audit/pre-phase3-hardening. Ensure Docker +
local Supabase are up (npx supabase status); Anthropic credits funded.

SCOPE: apps/web (auth; trainer onboarding; client funnel
teaser→preview→convert→consent→PWA→Stage-B interview; the backstops), packages/db
(migrations, RLS, grants, pgTAP), packages/ai (modelRouter, zodOutput, style,
allergens, preview, interview, escalation), packages/ui, CI/CD.

INVARIANTS (CLAUDE.md): all DB via packages/db; all AI via modelRouter(task); no
LLM arithmetic (money/macros in code); Zod-validate every AI output; every table
ships RLS policies + explicit grants + a pgTAP test; service-role bypasses RLS so
every cross-org read/write must verify org_id in code; allergen filter can only
DROP foods; health gate can only ADD flags.

PROCESS — find → verify → triage → apply → re-verify:
1. MAP routes, server actions, tables, RLS, AI agents, and the data-flow
   (lead→client→intake→plan_requests; consent; interview state machine).
2. AUDIT across 7 dimensions, reading REAL code; each finding = file:line +
   concrete failure scenario:
   (1) correctness/errors (logic, edge cases, races, async/error handling)
   (2) gaps — data sync & cross-phase (field alignment, orphan/leak states,
       state-machine holes, stub↔consumer mismatch, idempotency, migration
       back-compat)
   (3) security (RLS coverage + org_id tenancy in service-role paths, auth/
       session, public endpoints teaser/convert/cron/icon/push, SSRF/injection,
       input validation, secret handling, consent-evidence integrity)
   (4) code quality (DRY/YAGNI, naming, file responsibility, dead code, types,
       convention adherence)
   (5) feature opportunities PER STAGE — PROPOSE ONLY
   (6) UI — bugs (a11y/WCAG, responsive, dark mode, empty/loading/error states,
       hydration) → FIX; improvements/redesigns → PROPOSE ONLY
3. VERIFY every finding adversarially (independent refutation). This code passed
   multiple prior reviews — kill re-treads/false positives; keep only CONFIRMED.
4. TRIAGE + dedup → MUST-FIX (correctness/security/data-sync) · SHOULD-FIX (safe
   optimizations, clear UI bugs, quality) · PROPOSE-ONLY (features + UI redesign).
5. APPLY MUST-FIX + SHOULD-FIX, test-first where possible, ONE logical change at a
   time. Do NOT build PROPOSE-ONLY items.

REGRESSION SAFETY (hard requirement — do not break past phases):
- The build is green at commit 6b9bec4. It MUST be green after every change.
- After EACH change, run the FULL existing suite, not just the touched area:
  npm run typecheck; npm run lint; (npx supabase db reset && npx supabase test db)
  = all 118 pgTAP; (cd apps/web && npm run test) = full Playwright incl. the
  live-AI tests (credits funded).
- If a change regresses ANY previously-passing test or Phase 0–2 behavior, REVERT
  it and downgrade the finding to a proposal. NEVER weaken/delete/skip an existing
  test to make a fix pass. Trace the callers before changing shared code.

6. REVIEW: run /code-review at max effort + /security-review on the full audit
   diff; address Critical/Important; re-verify (gates green). Then PAUSE and ask me
   to trigger /code-review ultra on the branch (ultra is user-triggered/billed — you
   cannot launch it yourself).
7. REPORT: write docs/audit/<date>-pre-phase3-audit.md — every finding (severity,
   file:line, status fixed/proposed), the fixes applied, and the feature/UI proposal
   list for my decision. Commit incrementally; open a PR when the fixes are green.

GUARDRAILS:
- Do NOT break the currently-green build; unverifiable fix → downgrade to proposal.
- Do NOT auto-add features or UI redesigns.
- STOP and ask me before any ambiguous or product-shaped change.
- End with a summary: counts by severity, what was fixed, what's proposed.
```
