# PHASE 1 — Trainer Onboarding & Style-Learning Ingestion

**Ships:** the paying customer's activation pipeline: signup → brand → style ingestion (the "wow" moment) → tier builder → client import → demo client → first invite. Target: activated trainer in < 45 minutes.
**Depends on:** Phase 0 (auth, org model, shells, packages/ai).
**Feeds:** Phase 2 (invite/teaser links), Phase 4/5 (style profiles drive all drafts), Phase 6 (voice profile), Phase 7 (dashboard has data via demo client).

---

## ① Learn first (~45 min)

| Topic | Why | Where |
|---|---|---|
| Claude structured outputs + Zod validation | Style ingestion is extraction → JSON; you must be able to sanity-check the schemas Claude proposes | anthropics/claude-agent-sdk-typescript README; claude-api skill |
| Prompt caching | The style profile gets injected into every AI call forever — cache it or bleed money | claude-api skill (read the caching section) |
| Supabase Storage + signed URLs | Trainers upload PDFs/screenshots of old plans | supabase.com/docs/guides/storage |
| PDF/document text extraction basics | Ingestion quality = extraction quality; know the difference between text-layer PDFs and scanned images (need vision model) | skim `pdf` skill docs |
| Langfuse datasets & evals | Zero-edit rate metric starts here | langfuse.com/docs |

## ② Claude setup for this phase

- Skills to invoke while building: `superpowers:brainstorming` (before the ingestion UX), `feature-dev` (for each sub-phase), `frontend-design` (onboarding screens), `context7` (Supabase Storage APIs), `claude-api` skill (model routing + caching decisions).
- **Uninterruptable config:** add to `.claude/settings.json` allow-list: `Bash(npx supabase storage *)`. Add a PostToolUse hook running `npm run test --filter=ai` whenever `packages/ai/**` changes — ingestion regressions must surface instantly.
- Run style-extraction prompt iterations as a `ralph-loop` with promise "eval suite ≥ 90% field accuracy on fixture set".
- Use git worktree `phase-1` branch; commit per sub-phase.

## ③ GitHub repos for this phase

- [anthropics/claude-agent-sdk-typescript](https://github.com/anthropics/claude-agent-sdk-typescript) — agent pipeline + structured outputs (MIT)
- [567-labs/instructor-js](https://github.com/567-labs/instructor-js) — structured extraction patterns to borrow (MIT)
- [langfuse/langfuse](https://github.com/langfuse/langfuse) — tracing + eval datasets for ingestion quality
- [heyform/heyform](https://github.com/heyform/heyform) / [surveyjs/survey-library](https://github.com/surveyjs/survey-library) — multi-step wizard UX reference (don't adopt wholesale; build native shadcn steps)
- [vercel/platforms](https://github.com/vercel/platforms) — subdomain-per-trainer pattern for coachname.platform.com (MIT)

## ④ Pipeline map (no-gap trainer funnel)

```
signup(P0) → org exists
 └─ 1.1 Activation checklist shell (progress persisted, resumable, skippable steps marked)
     ├─ 1.2 Brand setup ──────────────▶ brand jsonb on orgs → used by P2 teaser, P4/P5 PDFs, portal theming
     ├─ 1.3 Style ingestion ──────────▶ style_profiles (diet/training/voice) → P4, P5, P6 prompts
     ├─ 1.4 Tier builder ─────────────▶ tiers table → P2 teaser CTA, P8 Stripe products
     ├─ 1.5 Client import wizard ─────▶ clients (status=lead|active) + invite drafts → P2
     ├─ 1.6 Demo client seeded ───────▶ fake logs/plans → P3–P7 screens never empty
     └─ 1.7 First invite sent ────────▶ P2 client onboarding begins
Stalled-step events → events table → P7 review queue nudges ("You haven't finished tier setup").
```

## ⑤ Sub-phases — copy-paste prompts

### 1.1 — Activation checklist engine

```
Read CLAUDE.md and docs/plan/PHASE-1-trainer-onboarding.md section ④ for the funnel map.

Build the trainer activation flow at /onboarding in apps/web:
- A persisted checklist (table: org_onboarding_state: org_id, step enum brand|style|tiers|import|demo|invite, status enum todo|done|skipped, completed_at) with RLS (org members only)
- UI: a single-page checklist with expandable step cards (shadcn Accordion), progress bar, each step deep-links to its flow and returns here; steps completable in any order but visually recommended in order; "skip for now" on brand/import/tiers, NOT on style ingestion
- Every step completion writes to the events table (type: 'onboarding_step_completed')
- If org has completed all non-skipped steps → celebratory completion state → CTA to dashboard
- A dismissible resume banner in TrainerShell shown whenever steps remain

Playwright test: complete steps out of order, reload mid-flow, verify persistence and banner logic. Commit: "feat(onboarding): trainer activation checklist".
```

### 1.2 — Brand setup step

```
Build the brand step at /onboarding/brand:
- Form: display name, logo upload (Supabase Storage bucket 'brand', public read, 2MB limit, image types only), primary color (color picker with contrast-safe validation against white and near-black text — warn if AA fails), subdomain slug (validated unique, reserved-word blocklist; custom own-domain support arrives in P9.5 — show "custom domain coming" hint), social links (instagram, youtube, tiktok, website)
- Live preview pane: mini portal mockup + plan-PDF header mockup updating as they type
- Persist to orgs.brand jsonb; slug to orgs.slug
- Middleware: resolve {slug}.<platform-domain> and /c/{slug} to the org's branded client-facing pages (vercel/platforms pattern — fetch current docs via context7)
- Client portal + teaser pages (P2) will read these tokens: expose a getOrgTheme(org_id) helper in packages/ui that returns CSS variables
- PortalShell (P0) footer: render the org's social links + trainer name via getOrgTheme (spec §11 requires socials on portal, emails, and plan PDFs — the other two land in 1.7 and P4.5)

Tests: slug collision, invalid image, AA warning shown. Commit: "feat(onboarding): brand setup with live preview".
```

### 1.3 — Style-learning ingestion (THE moat — take your time here)

```
Read docs/plan/00-MASTER-PLAN.md §4.2 (style profile design) carefully first. Load the claude-api skill.

Build style ingestion at /onboarding/style:

Data model (migration + RLS):
- style_profiles (id, org_id, domain enum diet|training|voice, version int, profile jsonb, status enum draft|confirmed, created_from text[], confirmed_at)
- style_exemplars (id, org_id, domain, content text, embedding vector nullable, source enum upload|edit_capture, quality_score float) — pgvector extension
- uploads (id, org_id, bucket_path, kind enum plan_pdf|checkin_screenshot|doc, extracted_text, extraction_status)

Flow:
1. Upload zone: drag-drop past diet plans, training splits, check-in conversation screenshots (PDF/docx/images, max 20 files). Store in Supabase Storage 'ingestion' bucket (org-scoped path, private).
2. Extraction worker (Supabase Edge Function or server action queue): text-layer PDFs → direct extract (pdf-parse); images/scans → Claude vision (modelRouter task 'ingest'); docx → mammoth. Persist extracted_text.
3. Extraction agents (packages/ai, one per domain, Zod-validated structured output):
   - dietStyleExtractor → meal structure, food rotation pool, carb timing, cuisine bias, supplement placement, banned/loved foods, protocol tendencies (IF/carb-cycling), portion style
   - trainingStyleExtractor → exercise pool ranked by frequency, split archetypes, volume/rep habits, progression style (load|volume|rotation), warmup patterns
   - voiceStyleExtractor → tone markers, greeting/signoff, emoji rate, phrase bank (10-30 verbatim phrases), language mix, avg message length
4. Confirmation UI (the wow moment): render each domain profile as plain-English editable statements ("You usually program 4-day upper/lower splits" [✓ correct] [✎ edit] [✗ wrong]). Every correction updates the profile jsonb. Confirm → status=confirmed, version=1.
5. Few files? (<3) → profile still generated, flagged low-confidence, UI says drafts will improve as they edit.

Quality harness: create packages/ai/evals/style-ingestion with 5 fixture uploads (write realistic fake trainer plans yourself — varied cuisines including Indian, one IF protocol, one carb-cycle) + expected profile JSONs; eval script scores field accuracy; wire results to Langfuse. Iterate extraction prompts until ≥90% on fixtures.

All AI calls through modelRouter (task 'ingest' → top model; prompt caching on system prompt). Commit: "feat(style): ingestion pipeline with confirmation UX + eval harness".
```

### 1.4 — Tier builder

```
Build the tier builder at /onboarding/tiers:
- Table: tiers (id, org_id, name, price_cents, currency, cadence enum monthly, position int, features jsonb {checkin_frequency: none|biweekly|weekly|daily, video_calls_per_month int, response_priority bool, custom_lines text[]}, is_active, stripe_product_id nullable — filled in Phase 8)
- UI: template ladder pre-filled (Basic/Silver/Gold/Platinum with sensible features per ORIGINAL-SPEC §8) → trainer renames, reprices, edits features, adds/removes tiers (max 6), drag-reorder
- The AI floor is constant and displayed as "included in every tier" (not editable): daily AI check-ins, meal logging, adherence tracking, monthly plan reviews
- Currency: default from org locale, single currency per org for now
- Client-facing tier card preview (branded via getOrgTheme) — this exact component is reused in P2 teaser unlock and P8 checkout

Tests: reorder persistence, min 1 tier, price validation. Commit: "feat(tiers): trainer-defined tier builder".
```

### 1.5 — Client import wizard (switcher migration)

```
Build /onboarding/import for coaches switching from Trainerize/Everfit/TrueCoach/spreadsheets:
- Accept CSV/XLSX upload; parse with a mapping UI: our fields (name, email, phone, goal, current weight, height, birthday, dietary preference, allergies!, notes) as dropdown targets for their columns; preview first 5 rows live
- AI-assist: a mapColumns agent (modelRouter 'parse', Zod output) proposes the mapping from headers + sample values; user confirms — never auto-applies
- Validation pass: flag rows with missing email AND phone, invalid emails, duplicate emails; allergies column strongly recommended (warn if unmapped)
- Import → clients rows (status=lead, source=import, intake jsonb with imported fields); NO invites sent automatically
- Post-import screen: "34 clients imported" → checkbox list → "Draft invites" queues personalized invite messages (P2 sends them; store as invite drafts)
- Undo: imports are batched (import_batches table) and reversible within 24h

Tests: messy fixture CSVs (extra columns, unicode names, missing emails). Commit: "feat(import): switcher client import wizard".
```

### 1.6 — Demo client + test drive

```
Build the demo client seeder FOUNDATION (later phases extend it as their tables land — do not seed data for tables that don't exist yet):
- Add clients.is_demo boolean column + partial index; on org creation (or from checklist step), seed client "Alex Demo" (clearly badged DEMO everywhere): clients row (status=active, source=invite, is_demo=true) with a realistic filled intake jsonb and a profile row
- Seeder architecture: packages/db/seed/demo-client.ts exports an idempotent seedDemoClient(org_id) composed of stage functions (seedCore now; seedLedger/seedPlans/seedSplit/seedThread are registered no-ops that Phases 3, 4, 5, 6 implement — each phase's DoD includes extending this seeder with 3 weeks of realistic data from ITS OWN engine: meal logs at 82% adherence, 2 missed weigh-ins, progressing working sets, an approved diet plan, an active split, one escalation message "my shoulder hurts", one pending drafted reply)
- "Reset demo client" button in settings re-runs the full seeder
- Demo exclusion rule NOW: is_demo filtered out of org analytics aggregates, exports, billing counts — add the shared query helper + test so every later phase inherits it
- "Send yourself the teaser" action: generates the org's teaser link (P2 route, stub if P2 not built yet) and shows QR + copy button

Tests: idempotency, is_demo exclusion in a sample aggregate query. Commit: "feat(demo): demo client foundation + staged seeder".
```

### 1.7 — Invites + activation completion

```
Build invite issuance closing the funnel:
- invites table already exists (P0): add channel enum copy_link|email, personal_message text
- UI: from checklist final step and from Clients screen: pick imported leads or enter email → optional personal note → generate tokenized invite link (/join/{token}, 14-day expiry) → send via Resend (branded template: trainer logo/colors, personal note, CTA, trainer social links in footer) or copy link
- /join/{token}: validates token, shows trainer-branded welcome, creates client account (Supabase auth), links profile to client row, marks invite used, hands off to P2 Stage B onboarding route (stub redirect if P2 unbuilt)
- Events: invite_sent, invite_opened (pixel/route hit), invite_accepted → funnel visible later in P7
- Rate limit: 100 invites/day/org

Playwright: full loop signup→import→invite→join on a second browser context. Commit: "feat(invites): tokenized client invites".
Update PROGRESS.md in the plan folder: Phase 1 complete.
```

## ⑥ Definition of done → handoff

- [ ] New trainer reaches "activated" (style confirmed + ≥1 tier + demo client explored) in <45 min unassisted
- [ ] Style ingestion eval ≥90% field accuracy on fixture set; zero-edit-rate metric logging to Langfuse from day one
- [ ] Confirmed style profiles queryable: `getStyleProfile(org_id, domain)` in packages/ai with prompt-cache-friendly serialization
- [ ] Import wizard survives messy real CSVs; allergies prominently handled
- [ ] Demo client makes every future screen demo-able; excluded from analytics/billing
- [ ] Invite loop works end-to-end into a P2 stub
- **Handoff to Phase 2:** /join/{token} lands on Stage B onboarding; teaser link route (org-branded) is where Phase 2 begins.
