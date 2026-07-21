# Pre-Phase 3 Hardening Audit — Triage Report

**Branch:** `audit/pre-phase3-hardening`
**Date:** 2026-07-21
**Triaged by:** Lead engineer (from verified auditor findings)

## Executive summary

This report triages 21 confirmed audit findings (20 after deduplication) into three action buckets. The single highest-risk item is a **safety-correctness bug in allergen filtering** (`packages/ai/src/allergens.ts`): the "Peas / Legumes" pick-list chip maps to no taxonomy tag and is substring-matched as a whole label, so pea/dal/chickpea foods reach the preview pool for a legume-allergic prospect — a direct violation of the hard "no allergen food in a preview" rule. Alongside it sit a cluster of Stage B interview concurrency and gating defects (opener double-post and paid-AI charges, missing day-boundary section openers, an unmetered paid-AI path, and a consent gate that only guards the render path, not the write path), a non-atomic demo seeder race that can permanently 500 the demo page, and a spoofable consent-evidence IP. UI defects include a WCAG-failing amber-on-light text color that renders safety-critical allergen lists near-illegible in the always-light production theme, and a read-to-end consent gate that opens the "Sign" button immediately. Six items are feature proposals (prospects CRM, style-strength meter, consent re-sign, AI resilience, auto client brief, lead scoring) that must NOT be auto-applied.

## Counts

| Bucket | high | medium | low | proposal | Total |
|---|---|---|---|---|---|
| MUST-FIX | 1 | 5 | 2 | — | 8 |
| SHOULD-FIX | 1 | 1 | 4 | — | 6 |
| PROPOSE-ONLY | — | — | — | 6 | 6 |
| **Total** | **2** | **6** | **6** | **6** | **20** |

**Dedup note:** Two auditors independently filed the day-boundary interview opener defect (`correctness-3` and a second `correctness-2`, both at `engine.ts:134`). They are merged into MF-3 below. All three `engine.ts:134` findings are distinct problems on the same line: MF-2 is the first-load double-post race; MF-3 is the missing day-2+ section opener.

---

## MUST-FIX

Correctness bugs, security holes, and data-sync defects. Ordered by severity.

### MF-1 · Allergen name-net misses multi-word pick-list labels — allergen food reaches preview (HIGH)

- **id:** correctness-1 (allergens) · **dimension:** correctness · **severity:** high
- **file:line:** `packages/ai/src/allergens.ts:193`

**What's wrong.** `nameNetTerms` matches each stored allergen entry as a single un-tokenized substring against `food.name_normalized`. Multi-word pick-list labels that have no taxonomy tag — notably `"Peas / Legumes"` — protect nothing: `excludedAllergenTags("peas / legumes")` returns an empty set and the whole-label substring `"peas / legumes"` never appears in real food names.

**Failure scenario.** A prospect selects the "Peas / Legumes" chip (`apps/web/lib/onboarding/allergens.ts:24`); `stage-a-form.tsx` stores the label verbatim, so `leads.allergens = ["Peas / Legumes"]`. In `getOrCreatePreview → filterSafeFoods → isFoodSafe`, the seed foods "Green peas, cooked", "Chickpeas (chana), cooked", and "Pigeon pea (toor dal), cooked" all carry `allergen_tags []`, so `isFoodSafe` returns true and they enter the candidate pool. The belt-and-suspenders re-check in `generate.ts` only re-validates membership in that same already-unsafe pool. A legume/pea-allergic client is shown pea/dal/chickpea foods in the teaser. ("Milk / Dairy" and "Crustaceans (prawn, crab)" survive only because the tag path independently matches milk/prawn/crab; "Peas / Legumes" has no such backstop.)

**Suggested fix.** In `nameNetTerms`, tokenize each allergen entry on non-alphanumerics and keep tokens ≥4 chars instead of substring-matching the raw label; and/or add legume/pea (plus mustard, corn, sulphite) groups to the TAXONOMY so the pick-list can only offer allergens the enforcement layer can map. At minimum, the Stage-A pick-list must not offer an allergen the filter cannot enforce.

**Regression risk / phase.** Touches the P2 preview pipeline and the shared allergen module reused by P4/P5 plan generation. Tokenizing the name-net will broaden matches — add tests asserting green peas/chickpea/toor dal are excluded for "Peas / Legumes" and that existing single-word allergens (nuts, milk) still pass. Coordinate the TAXONOMY change with the pick-list so no orphan chips remain.

### MF-2 · Interview opener double-posts and double-charges on concurrent first load (MEDIUM)

- **id:** correctness-1 (interview) · **dimension:** correctness / errors · **severity:** medium
- **file:line:** `apps/web/lib/interview/engine.ts:134`

**What's wrong.** `ensureInterview` posts the opening interview question with no lease/dedup guard, so concurrent first loads double-post it and issue two paid Sonnet calls.

**Failure scenario.** `/welcome/interview` is a server component. Two concurrent loads (Link hover-prefetch then click, two tabs, or a quick double navigation) both insert `interview_state` (the PK dedupes the row; the 23505 on the loser is silently ignored at `:112`), both re-read the same state, both see `messages.length===0 && status in_progress && section`, both call `interviewTurn()` (two paid calls) and both `say(assistant, opening)`. `messages` has no unique constraint on `(client_id, kind)`, so the client sees the opener twice. Unlike `runTurn` and the nudge job (which leases on `last_prompt_at`), this path has no concurrency guard; `:147` updates `last_prompt_at` unconditionally.

**Suggested fix.** Before posting the opener, lease the row with optimistic concurrency (`UPDATE interview_state SET last_prompt_at=now() WHERE client_id=? AND last_prompt_at IS NULL RETURNING ...`) and proceed to `interviewTurn`/`say` only when the update affected a row — mirroring `runInterviewNudges` (`stall.ts:51`).

**Regression risk / phase.** P2.5 interview engine. The lease changes the first-turn control flow; verify the single-load happy path still posts exactly one opener, and that a re-entry after a failed opener retries correctly. Low blast radius beyond the interview.

### MF-3 · Day-2+ unlocked section never gets its opening question (MEDIUM)

- **id:** correctness-3 + correctness-2 (interview) — *merged, two auditors* · **dimension:** correctness · **severity:** medium
- **file:line:** `apps/web/lib/interview/engine.ts:134`

**What's wrong.** The opening-turn block is gated on `messages.length === 0`, so it fires only for the very first section. A section that unlocks on a later day never gets its opening question.

**Failure scenario.** Day 1 completes logistics+goals (both SECTION_DAY 1). Day 2 the client reopens `/welcome/interview`; `ensureInterview` sees `messages.length>0`, skips the opener, and returns `section=nutrition`, `waitingForNextDay=false` (`:155`). `InterviewThread` leaves the input open (`interview-thread.tsx:31`) under a stale day-1 confirmation bubble with no nutrition prompt. When the client types, `runTurn` parses that unprompted text as their nutrition answer, inverting the coach-asks-first flow. The 24h stall nudge (`stall.ts:54`) posts a generic body, never the actual next-section question. Every multi-day interview hits this at each day boundary. (Health-gating and code-side schema parsing prevent data/safety corruption, keeping it medium.)

**Suggested fix.** In `ensureInterview`, detect that the current open section has no assistant prompt yet (e.g. `last_prompt_at` predates the section unlock, or the active section differs from the section of the last assistant prompt — persist/compare that section) and post the section opener, not just when the whole thread is empty.

**Regression risk / phase.** P2.5 interview engine; shares the same line as MF-2, so fix them together and re-lease consistently. Add a multi-day test that asserts each unlocked section posts its opener on reopen and that the client's first reply is treated as an answer only after a prompt exists.

### MF-4 · Non-atomic demo-client seeder races into duplicate demo rows that then 500 every reader (MEDIUM)

- **id:** gaps-1 · **dimension:** gaps — data-sync & cross-phase · **severity:** medium
- **file:line:** `packages/db/src/seed/demo-client.ts:57`

**What's wrong.** The "idempotent" seeder is a select-then-insert with no unique constraint backing it. Migration `20260715200000_demo_client.sql` creates only a NON-unique partial index (`clients_org_id_is_demo_idx`) — nothing enforces "one demo per org."

**Failure scenario.** `seedDemo()` and `resetDemo()` (`apps/web/app/onboarding/demo/actions.ts:34,51`) are plain server-action POSTs behind buttons. A double-click (or `seedDemo` racing `resetDemo`) fires two concurrent invocations: both `select ... .eq("is_demo",true).maybeSingle()` see no row, both INSERT, and the org now has two `is_demo=true` clients. From then on every `.eq("is_demo",true).maybeSingle()` — the demo step page (`page.tsx:29`) and `seedDemoClient` itself (`:57`) — throws PGRST116 (multiple rows), so the demo page 500s and reseeding/resetting can never recover without manual DB cleanup.

**Suggested fix.** Add a partial UNIQUE index `create unique index on public.clients (org_id) where is_demo` (collapsing any existing dupes first), then make `seedDemoClient` upsert on that key / treat 23505 as "already seeded." The team already shipped exactly this partial-UNIQUE + 23505 backstop for the same race in `plan_requests_onboarding_unique.sql`; this table lacks it.

**Regression risk / phase.** Requires a migration (dedupe existing rows, then add the unique index) plus a code change to handle 23505. Onboarding/demo (P2). Verify against a hosted push (see the hosted-extension gotcha) and confirm the dedupe step runs before the index is applied.

### MF-5 · Consent-evidence IP read from spoofable leftmost X-Forwarded-For hop (MEDIUM)

- **id:** security-1 · **dimension:** security · **severity:** medium
- **file:line:** `apps/web/app/(app)/consent/actions.ts:55`

**What's wrong.** `recordConsent` reads `hdrs.get("x-forwarded-for").split(",")[0]` — the client-supplied leftmost hop — and writes it verbatim into `consents.ip` and the delivered PDF as durable legal evidence, while the docstring (`:22-25`) claims the IP is "captured server-side (never client-supplied)."

**Failure scenario.** A client signing the click-wrap sends `X-Forwarded-For: 203.0.113.9`; the attacker-chosen value becomes the recorded consent IP. The same codebase's leads endpoint (`apps/web/app/c/[slug]/start/actions.ts:55-58`) explicitly documents this hop as spoofable and deliberately uses `x-real-ip` / the rightmost hop instead — so the consent path records a forgeable IP, undermining the evidentiary value of the consent trail.

**Suggested fix.** Derive the IP as the leads endpoint does: prefer `hdrs.get("x-real-ip")?.trim()`, then fall back to the RIGHTMOST XFF hop (`split(",").pop()`), never the leftmost. Factor a shared `clientIp(headers)` helper so the consent and leads paths cannot drift.

**Regression risk / phase.** P2.3 consent system. Low code risk; the fix aligns with proven sibling code. Verify behind the actual proxy chain (Vercel/hosting) that `x-real-ip` and the rightmost hop resolve to the true client IP, and confirm the docstring now matches behavior.

### MF-6 · Stage B interview drives unbounded paid Claude calls with no per-client rate limit (MEDIUM)

- **id:** security-2 · **dimension:** security · **severity:** medium
- **file:line:** `apps/web/lib/interview/engine.ts:186`

**What's wrong.** `runTurn` calls `detectHealthFlags(text)` at `:186` — an unconditional paid `classify` call (`packages/ai/src/escalation.ts:149`) — before any section/day gating, and additionally calls `interviewTurn` (a paid `draft`) at `:250` when a section is open. There is no per-client turn budget, rate limit, or middleware throttle on this path.

**Failure scenario.** A converted `role=client` repeatedly invokes the `sendAnswer` server action (`apps/web/app/(app)/welcome/interview/actions.ts:33`). Server actions are stable POST endpoints; the client can keep the interview `in_progress` indefinitely (never supplying completing answers) and burns up to 2 model calls per HTTP request — even a classify call per message in the between-days "waiting" state. `rateLimitDecision` is imported only by `start/actions.ts` (public submit), so this authenticated path is unbounded. This contrasts with the "at most once per lead" preview path and the Turnstile-gated public submit — bounding paid AI is a hard requirement everywhere else.

**Suggested fix.** Add a per-client turn/rate budget before the AI calls in `runTurn` (cap interview messages per client per rolling window, e.g. via a `messages` count on `kind='interview'` or `interview_state.nudges_sent`-style counting), short-circuiting `detectHealthFlags`/`interviewTurn` once exceeded and degrading to a "try again later" reply. Keep the health gate correct by still pausing on any keyword-only match without the classifier call when throttled.

**Regression risk / phase.** P2.5 interview + AI budget concerns (relates to Phase 9 budget meter). Ensure the throttle never suppresses a genuine health-flag pause. Verify a normal-cadence interview is never rate-limited.

### MF-7 · Preview generation has no lock — concurrent loads each run a paid generation (LOW)

- **id:** correctness-2 (preview) · **dimension:** correctness / errors · **severity:** low
- **file:line:** `apps/web/lib/preview/generate.ts:102`

**What's wrong.** The header comment promises "Generation is a paid AI call, so it runs at most once per lead," but the only guard is a read-then-check (`if lead.preview) return`) with an unconditional cache write at `:191` — a TOCTOU with no lock or conditional claim.

**Failure scenario.** Two concurrent loads of `/c/{slug}/preview/{leadId}` (double-click on the form's `router.push`, Link prefetch + navigation, or two tabs) both read `lead.preview === null`, both call `generatePreviewDraft()` (two paid Sonnet calls), both write the cache (last writer wins), and both fire `preview_shown`. Cost and duplicate-event only; no correctness/security impact, hence low.

**Suggested fix.** Serialize generation: take a pg advisory lock keyed on `leadId`, or claim the work with a conditional update (`set preview_generating_at ... WHERE preview IS NULL AND preview_generating_at IS NULL RETURNING ...`) and have losers return the pending state instead of generating.

**Regression risk / phase.** P2 preview pipeline. If using a `generating` sentinel, ensure a crashed/abandoned claim is reclaimable (TTL) so a stuck sentinel never permanently blocks generation.

### MF-8 · Interview write-path (`sendAnswer`) not behind the consent gate (LOW)

- **id:** gaps-3 · **dimension:** gaps — data-sync & cross-phase · **severity:** low
- **file:line:** `apps/web/app/(app)/welcome/interview/actions.ts:34`

**What's wrong.** `require-consent.ts` states the consent gate "must cover EVERY coaching surface... especially the Stage B interview (which collects health disclosures)," but `requireConsentedClient` runs only when the interview PAGE renders. `sendAnswer → runTurn` resolves `ownClient()` purely from JWT claims (`orgId/userId/role==='client'`, `actions.ts:9-25`) and never checks `clients.consent_signed_at`.

**Failure scenario.** An authenticated `role=client` who has not signed consent can invoke the `sendAnswer` server action directly (server actions are stable POST endpoints), driving the whole interview — creating `interview_state`, `messages`, and triggering `detectHealthFlags` health-disclosure capture into `clients.health_flags` — with no consent evidence row, contradicting the invariant the rest of Phase 2.3/2.5 is built around. Middleware (`middleware.ts:79`) gates `/welcome` on auth only.

**Suggested fix.** Route `sendAnswer` (and `ownClient`) through `requireConsentedClient` / re-check `clients.consent_signed_at` before calling `runTurn`, so the write path fails closed the same way the render path does.

**Regression risk / phase.** P2.3/P2.5 boundary. Verify a consented client is unaffected and an un-consented POST is rejected. Pairs naturally with the MF-6 throttle change on the same action.

---

## SHOULD-FIX

Clear UI bugs and worth-fixing code-quality issues. Ordered by severity.

### SF-1 · `text-warning` fails WCAG AA contrast in the always-light production theme (HIGH)

- **id:** ui-1 · **dimension:** UI · **severity:** high
- **file:line:** `apps/web/components/demo-client.tsx:115` (+ `import-wizard.tsx:191`, `:262`; `brand-form.tsx:219`)

**What's wrong.** `--warning` is `oklch(0.769 0.164 70.08)` (≈ #f59e0b), tuned so its DARK foreground passes on a warning *fill*. Several places use it inverted, as amber TEXT on the page background/surface. Measured contrast is 2.14:1 on `--background` and 1.99:1 on `--surface` — far below the 4.5:1 AA minimum. Production never applies a `.dark` class (`layout.tsx:31`; the only toggle is `styleguide/theme-toggle.tsx`), so every real user is in light mode and always sees the failing contrast. Most seriously, a demo client's allergy list (`demo-client.tsx:115`) renders the foods a client cannot eat in near-illegible pale amber. The styleguide only QAs `bg-warning text-warning-foreground` (`page.tsx:42`), so this inverted usage was never contrast-checked.

**Failure scenario.** A trainer reviewing the demo client, or an operator reading the import wizard's "no allergies column mapped" warning, cannot reliably read the amber text — a legibility failure on safety-relevant allergen content.

**Suggested fix.** Do not use `--warning` as text on light surfaces. Add a dedicated darker `--warning-text` (~`oklch(0.52)` amber, matching how `--success`/`--muted-foreground` were deepened to clear 4.5:1), or render these as a chip/badge with dark ink on a warning fill (the Badge `warning` variant). Update `demo-client.tsx:115`, `import-wizard.tsx:191` & `:262`, `brand-form.tsx:219`.

**Note.** UI defect by taxonomy, but flagged high because it degrades safety-critical allergen text; treat as top of the SHOULD-FIX queue. Add a styleguide contrast case for warning-as-text so it cannot regress.

### SF-2 · Consent "scroll to the end" gate is defeated by the page layout (MEDIUM)

- **id:** ui-2 · **dimension:** UI · **severity:** medium
- **file:line:** `apps/web/components/consent-form.tsx:89`

**What's wrong.** `canSign` requires `scrolledEnd`, set only when the inner `overflow-y-auto` div reports it has been scrolled near its bottom. For that div to scroll, an ancestor needs a bounded height — but the consent page wraps the form in `<main class="... min-h-[100dvh] flex flex-col ...">` (`consent/page.tsx:37`), a min-height, so with the real ~8-section agreement the flex column grows to fit content and the whole page scrolls instead of the inner div. `checkScrolled` (`:61`) then sees `scrollHeight ≈ clientHeight` on mount and flips `scrolledEnd` true immediately: the "Scroll to the end to continue" hint never shows and "Sign & continue" is enabled before the client reads anything. In the alternative bounded case, the div has no `tabIndex`/`role`, so keyboard-only users cannot scroll it (WCAG 2.1.1). Either way the read-to-end compliance gate is broken. E2E `consent.spec.ts:46-50` masks it by scrolling + name + checkbox together.

**Suggested fix.** Give the scrollable region a bounded height so it actually scrolls internally (`main` uses `h-[100dvh]` with `min-h-0` children, or the doc div gets `max-h-[60vh]`), and make it keyboard-operable with `tabIndex={0}` + `role="region"` + an aria-label. Alternatively drop the flex-height dependency and detect read-completion with an IntersectionObserver sentinel at the end of the document that works whether the page or the div scrolls.

**Note.** P2.3 consent compliance surface — the fix restores a deliberate legal gate. Add an e2e assertion that "Sign" is disabled before the sentinel is reached.

### SF-3 · Auth pages have no heading element (`h1`) (LOW)

- **id:** ui-3 · **dimension:** UI · **severity:** low
- **file:line:** `apps/web/app/(auth)/auth-card.tsx:39`

**What's wrong.** `AuthCard` renders its title via `<CardTitle>`, which is a plain `<div>` (`packages/ui/src/components/card.tsx:28`). `login/page.tsx` and `signup/page.tsx` render only `AuthCard`, so the document has no `h1` (or any heading). Screen-reader users get no page heading in the headings list; "Welcome back" is announced as generic content. Every other app route uses a real `h1`.

**Suggested fix.** Render the auth title as an `h1` (e.g. `CardTitle asChild` → `<h1>`, or add an `<h1 className="sr-only">` in `AuthCard`). Visual unchanged.

### SF-4 · Duplicated confirmed-style serialization bypasses `serializeStyleProfile()` (LOW)

- **id:** cq-1 · **dimension:** code quality (DRY) · **severity:** low
- **file:line:** `apps/web/lib/interview/engine.ts:80` (and `apps/web/lib/preview/generate.ts:131-133`)

**What's wrong.** The block `(rows ?? []).map((s) => \`${s.domain} style: ${JSON.stringify(s.profile)}\`).join("\n")` is byte-identical in `styleFor()` (`engine.ts:79-82`) and `getOrCreatePreview()` (`generate.ts:131-133`), and both hand-roll `JSON.stringify` instead of using `serializeStyleProfile()` (`packages/ai/src/style/serialize.ts`), which was built "for injection into downstream prompts (P4/P5/P6)" and currently has zero callers. Changing the injection format requires editing both copies; missing one silently diverges the interview and preview agents' view of the same trainer style.

**Suggested fix.** Extract one shared helper (or reuse `serializeStyleProfile` per domain) that both `styleFor()` and `getOrCreatePreview()` call.

**Note.** Maintainability only, no runtime failure. Prefer wiring in the existing `serializeStyleProfile` so the intended P4/P5/P6 path is exercised.

### SF-5 · Duplicated client-account provisioning + magic-link handoff (LOW)

- **id:** cq-2 · **dimension:** code quality (DRY) · **severity:** low
- **file:line:** `apps/web/lib/preview/convert.ts:64` (and `apps/web/lib/invites/claim.ts:57-102`)

**What's wrong.** `convertLead()` (`convert.ts:64-134`) and `claimInvite()` (`claim.ts:57-102`) independently implement the same create-user → insert `profiles role='client'` → `deleteUser` rollback → `generateLink magiclink` → build `/auth/confirm?token_hash=…&type=email&next=/portal` sequence, including a byte-identical confirm URL. A change to the provisioning contract (new required column, rollback semantics, confirm-URL shape) must be mirrored across both, and missing one leaves a subtly broken onboarding entry point (orphaned auth user, or a client landing on the wrong post-login route).

**Suggested fix.** Factor the shared "create client auth account + role profile with rollback" step and the "magic-link → /auth/confirm URL" builder into one helper (e.g. `lib/auth`) that both call.

**Note.** The two flows diverge (new-client insert vs existing-client update, different result types), so keep the divergent parts at the call sites. No reachable runtime failure.

### SF-6 · Unused exported `PREVIEW_MODEL` constant (LOW)

- **id:** cq-4 · **dimension:** code quality (dead code) · **severity:** low
- **file:line:** `packages/ai/src/preview.ts:118`

**What's wrong.** `PREVIEW_MODEL = modelRouter("draft")` is referenced only at its definition and its re-export (`packages/ai/src/index.ts:53`) — zero consumers. Its comment claims "for tracing/tests" but nothing uses it. It is a dead public export that enlarges the package API surface and couples the preview module to `modelRouter` at load time for no benefit.

**Suggested fix.** Remove `PREVIEW_MODEL` and its re-export, or add the intended tracing/test consumer that justifies it.

---

## PROPOSE-ONLY

Feature suggestions and UI redesigns (`kind='proposal'`). **Do NOT auto-apply** — these are product decisions for the owner, not audit fixes.

### PO-1 · Trainer-facing prospect/lead pipeline view

- **id:** feat-2 · **dimension:** feature-opportunity · **file:** `apps/web/lib/onboarding/stage-a.ts:96`

The `leads` table already has org-staff read RLS and a full status machine (`started → preview_shown → converted → expired`), but no UI ever shows a trainer their prospects — every app read of `.from("leads")` is public teaser-flow only. A coach has zero funnel visibility. **Proposal:** add a "Prospects" view (Phase 7 or a light Phase 2 addition) — a table over org `leads` rows with name, goal, submitted date, funnel stage, allergen flag, and "copy preview link" / "convert manually" actions. Reuses existing RLS and enum; no schema change. Pairs with PO-6 (lead scoring).

### PO-2 · Style-profile strength/coverage meter + "add more examples later"

- **id:** feat-3 · **dimension:** feature-opportunity · **file:** `apps/web/lib/onboarding/steps.ts:37`

The style profile is "the moat" but is captured once in onboarding and only improves via the edit-capture loop, which cannot run until the trainer has clients. A brand-new trainer with two thin documents gets a weak AI twin, risks it on their first teaser/interview, and concludes "the AI doesn't sound like me." **Proposal:** a per-domain (diet/training/voice) confidence/coverage meter computed in code from what was extracted, surfaced on `/onboarding/style` and in settings, with a persistent "add more plans / check-ins to sharpen your AI" affordance that re-runs the existing extraction agents.

### PO-3 · Consent re-sign flow when the consent document version changes

- **id:** feat-4 · **dimension:** feature-opportunity · **file:** `apps/web/lib/consent/doc.ts:5`

`consents` stores `doc_version` + `doc_sha256` and `CONSENT_DOC_VERSION` is a first-class constant, but the portal gate (`require-consent.ts:34`) only checks whether a client has ANY signed consent, not the current version. When the lawyer-reviewed template moves v1→v2, every existing client keeps operating under stale consent with no re-acknowledgement — real exposure for a health-adjacent product. **Proposal:** compare the client's latest `doc_version` against `CONSENT_DOC_VERSION` and route to a re-consent screen on mismatch (append-only insert preserving history), plus a trainer/admin "material change → require re-consent" toggle so cosmetic edits don't force friction.

### PO-4 · AI resilience layer in `modelRouter` (fallback tiers + circuit breaker)

- **id:** feat-5 · **dimension:** feature-opportunity · **file:** `packages/ai/src/modelRouter.ts:28`

`modelRouter` is a static task→single-model map with no retry/fallback/circuit-breaker; `claude.ts:47-49` re-throws. An Anthropic 529, a 5xx, or exhausted credits (which PROGRESS.md records already blocked the live-AI suite) takes down whatever it touches — the prospect mid-teaser and the client mid-interview, the two highest-intent funnel moments, silently fail. **Proposal:** an optional fallback chain + retry/backoff (draft tier Sonnet→Haiku on overload/credit errors), a short circuit breaker, and a global "AI degraded" flag the funnel can read to show honest holding copy. Centralize in `modelRouter`/`claude.ts` and emit a degradation event the Phase 9 budget meter can alert on. *Caveat: same-provider tier fallback would not cure the credit-exhaustion incident it cites.*

### PO-5 · Auto-generated trainer "client brief" on Stage B completion

- **id:** feat-6 · **dimension:** feature-opportunity · **file:** `apps/web/lib/interview/engine.ts:1`

`completeIntake` assembles a structured `clients.intake` blob but the trainer's first exposure to a new human is a pile of JSON fields. **Proposal:** on intake completion, generate a short neutral-voice brief via `modelRouter('draft')` strictly from captured intake fields (no new questions, no arithmetic, Zod-validated) — goal, constraints, schedule, dietary pattern, and any `health_flags` called out prominently — stored for the trainer and surfaced as the header of the Phase 7 per-client inbox and the health-review queue. Especially valuable for `paused_health` interviews requiring personal follow-up.

### PO-6 · AI lead-intent scoring on teaser submission

- **id:** feat-7 · **dimension:** feature-opportunity · **file:** `apps/web/lib/onboarding/stage-a.ts:52`

Stage A answers already contain everything needed to estimate intent, but the trainer has no signal to triage follow-up. A coach with 40 launch-push submissions can't tell 5 hot leads from 35 tire-kickers. **Proposal:** at submit (or lazily), run a cheap `modelRouter('classify')` pass over Stage A answers to produce a Zod-validated `{intent_band, one_line_reason}` (qualitative triage only — never an LLM-computed number), stored on the lead and rendered as a sort/priority signal in the PO-1 Prospects view. Respects the no-LLM-arithmetic invariant.

---

*End of report. No git operations performed.*
