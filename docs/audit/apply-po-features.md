# Apply the 6 PROPOSE-ONLY features (PO-1…PO-6)

Paste the block below in a fresh session (after `/clear`) to build all six feature proposals from the pre-Phase-3 audit. Full spec for each PO is in `docs/audit/2026-07-21-pre-phase3-audit.md` (PROPOSE-ONLY section).

---

```
Build the 6 PROPOSE-ONLY features (PO-1…PO-6) from the pre-Phase-3 audit for
supertrainer (/Users/ranjeet/Claude Code/supertrainer).

ORIENT FIRST: read docs/audit/2026-07-21-pre-phase3-audit.md (the "PROPOSE-ONLY"
section has the full spec + file anchors for each PO), CLAUDE.md, docs/plan/
PROGRESS.md, and the supertrainer-* memory. Confirm clean git state on main
(pull latest). New branch: git checkout -b feat/audit-po-features. Ensure Docker
+ local Supabase up (npx supabase status) and Anthropic credits funded.

INVARIANTS (CLAUDE.md — non-negotiable): all DB via packages/db; all AI via
modelRouter(task); no LLM arithmetic (money/macros in code); Zod-validate every
AI output; every NEW table ships RLS policies + explicit grants + a pgTAP test in
the same change; service-role bypasses RLS so every cross-org read/write verifies
org_id in code; allergen filter only DROPS foods; health gate only ADDS flags.
Follow existing patterns (server components + server actions; packages/ui tokens;
EmptyState/Skeleton/ErrorBoundary; the metric utility).

BUILD ORDER (one at a time — brainstorm briefly only where a product decision is
genuinely open, otherwise implement per the audit spec; commit each PO
separately; STOP and ask me before any ambiguous product/UX choice):
1. PO-3 — Consent re-sign on doc_version bump (compliance; do FIRST). Compare a
   client's latest consents.doc_version vs CONSENT_DOC_VERSION in the portal gate
   (require-consent.ts); route to a re-consent screen on mismatch (append-only
   insert preserving history); add a "material change → require re-consent" flag
   so cosmetic edits don't force friction.
2. PO-5 — Auto client brief on Stage B completion: in completeIntake, generate a
   short neutral-voice brief via modelRouter('draft') strictly from captured
   intake fields (no new questions, no arithmetic, Zod-validated), health_flags
   prominent; store it for the trainer (surface later in Phase 7).
3. PO-6 — AI lead-intent scoring on teaser submit: a cheap modelRouter('classify')
   pass over Stage A answers → Zod-validated {intent_band, one_line_reason}
   (qualitative only, never an LLM number), stored on the lead.
4. PO-1 — Trainer prospects/lead pipeline view: a "Prospects" screen over org
   `leads` (existing RLS), showing name/goal/date/funnel-stage/allergen flag +
   copy-preview-link / convert-manually actions + the PO-6 intent band. No schema
   change beyond PO-6's column.
5. PO-2 — Style-strength/coverage meter: per-domain (diet/training/voice)
   confidence computed IN CODE from what was extracted; surface on /onboarding/
   style + settings with an "add more examples to sharpen your AI" affordance that
   re-runs the existing extraction agents.
6. PO-4 — AI resilience in modelRouter: optional fallback chain + retry/backoff
   (draft Sonnet→Haiku on overload/credit errors) + a short circuit breaker + a
   global "AI degraded" flag the funnel can read for honest holding copy. NOTE:
   this is the largest/riskiest — if it grows beyond a focused change, STOP and
   propose splitting it into its own phase rather than forcing it here.

REGRESSION SAFETY (hard): the build is green at the current main (audit baseline
1e63677). After EACH PO, run the FULL suite and keep it green: npm run typecheck;
npm run lint; (npx supabase db reset && npx supabase test db); (cd apps/web &&
npm run test) incl. live-AI. Any regression → fix or revert; never weaken/skip a
test. New live-AI e2e must be gated test.skip(!process.env.ANTHROPIC_API_KEY,…)
and its no-key path must still pass (CI has no key — see docs/audit/AUDIT-BASELINE.md).

FINISH: /code-review (max) + /security-review on the diff; fix Critical/Important;
then ask me to run /code-review ultra; open a PR. On merge, run migrate.yml for
any new migrations, then update docs/audit/AUDIT-BASELINE.md's baseline commit.

Do NOT re-audit Phases 0–2 (already hardened — see AUDIT-BASELINE.md).
```
