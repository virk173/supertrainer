# PHASE 7 — The Trainer Dashboard ("Looks Like It Took 10 Years")

**Ships:** the trainer's daily-driver: global review queue, per-client inboxes (thread + drafts + to-do in one view), client roster with forensic adherence lenses, business analytics, churn radar — designed and polished to top-1% SaaS standard.
**Depends on:** P0–P6 (every data surface exists; this phase is 80% UI craft, 20% aggregation queries).
**Feeds:** P8 (billing flags render here), P9 (analytics foundation).

---

## ① Learn first (~50 min)

| Topic | Why | Where |
|---|---|---|
| The Linear/Stripe/Vercel design language | "10 years of polish" = consistent craft: hairlines, focus rings, designed empty/loading states, monochrome + one accent | research/dashboard-ui.md — "Design references" + "Recipe" sections (read both linked articles) |
| Radix 12-step color scale mapping | Steps 1–2 bg, 3–5 UI, 6–8 borders, 9–10 accent, 11–12 text — this system prevents 50 sessions of drift | radix-ui.com/colors |
| TanStack Table v8 server-side patterns | The roster is a data-dense table done right | openstatus data-table demo |
| OKLCH + tweakcn theme workflow | Generate the light+dark theme ONCE, tokens forever | tweakcn.com (play with it 15 min) |

## ② Claude setup for this phase (the dashboard-specific arsenal)

**Install now:**
```
npx shadcn@latest mcp init --client claude     # shadcn MCP — real registry APIs, no hallucinated props
/plugin install v0@claude-plugins-official      # alternative treatments for stubborn pages
/plugin install snapshot@claude-plugins-official # visual regression once polished
```
**Skills to load in EVERY dashboard session:** `frontend-design` (before any UI code — non-negotiable), `dataviz` (before any chart), `vercel:shadcn`, `webapp-testing`/playwright plugin (screenshot loop).
**Optional:** Figma MCP (authenticate via `/mcp` in interactive session) if you sketch refs first; `figma:figma-design-to-code`.

**The design-consistency harness (do BEFORE first screen — this is what makes 50 sessions look like one designer):**
1. Add a `DESIGN.md` section to CLAUDE.md: Geist Sans + Geist Mono numerals (`tnum`), spacing {4,8,12,16,24,32,48} only, ONE radius (8px), 1px borders from `border` token only, single accent color, semantic colors = status only, shadows ≤ `shadow-sm`, no gradients, 150–200ms ease-out hover transitions only, hairlines over boxes.
2. Generate the light+dark OKLCH theme in tweakcn (Radix 12-step mapping) → export CSS vars → `globals.css`. Hardcoded hex values are lint errors (write the ESLint rule).
3. PostToolUse hook: on any `apps/web/**/*.tsx` edit → typecheck + eslint (catches hex violations instantly).
4. The screenshot loop (uninterruptable polish): ralph-loop each screen with promise "Playwright screenshots at desktop/mobile/dark pass self-review against DESIGN.md with zero violations" — 2 full passes per screen.

## ③ GitHub repos + design resources for this phase

**Build on / study:**
- [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin) — ~11k★ — layout/UX reference: collapsible sidebar, ⌘K, RTL (MIT)
- [Kiranism/next-shadcn-dashboard-starter](https://github.com/Kiranism/next-shadcn-dashboard-starter) — ~6k★ — structural patterns (we integrate into our app, not adopt)
- [openstatus data-table](https://data-table.openstatus.dev/) — THE data-table pattern: server-side everything, faceted filters, URL state
- [tremorlabs/tremor](https://github.com/tremorlabs/tremor) — Tremor Blocks free since Vercel acquisition — chart/KPI block patterns (Apache-2.0)
- [refinedev/refine](https://github.com/refinedev/refine) — reference for admin data-hook patterns (MIT)

**Component sources (all shadcn-registry compatible — install via shadcn MCP):**
- [Origin UI](https://originui.com) — 400+ components; the gap-filler for dense app UI
- [shadcn/ui charts](https://ui.shadcn.com/charts) — Recharts v3, official — 90% of our charts
- [visx](https://airbnb.io/visx/) — ONE signature bespoke viz only (the adherence forensic grid)
- [Vercel Geist](https://vercel.com/geist/typography) — typography system + icons
- [cmdk](https://github.com/pacocoursey/cmdk) — ⌘K command palette
- Avoid: Nivo (App Router issues), heavy animation libs in-app (Aceternity/Magic UI = marketing site only)

## ④ Pipeline map

```
data sources (all built): P3 scores/patterns · P4/P5 drafts · P6 threads/drafts/escalations/digest
· P8 billing flags (stub renders now, lights up in P8)
      ▼
7.1 design harness + shell (sidebar, ⌘K, topbar, theme)
7.2 Home (morning digest = spec §13 daily habit loop)
7.3 Global review queue (approve everything fast)
7.4 Per-client inbox (thread + drafts + to-do + forensic panel — spec §8's centerpiece)
7.5 Roster + client profile (the forensic ledger lens)
7.6 Business analytics + churn radar
7.6b Monthly client progress report (PDF + share card — the trainer's marketing loop)
7.7 Polish gate (the "10 years" pass)
      ▼
every approve/reject action → P4/P5/P6 mutations → realtime queue refresh
```

## ⑤ Sub-phases — copy-paste prompts

### 7.1 — Design harness + dashboard shell

```
Load frontend-design skill and dataviz skill NOW, before any code. Read docs/plan/research/dashboard-ui.md fully, especially the 10-step Recipe. Read docs/plan/PHASE-7-dashboard.md §② harness steps — execute them: DESIGN.md rules into CLAUDE.md, tweakcn OKLCH theme (light+dark) exported into globals.css, ESLint no-hardcoded-colors rule, PostToolUse lint hook.

Then rebuild TrainerShell (P0 placeholder) to final quality, studying satnaing/shadcn-admin patterns via the shadcn MCP:
- Sidebar 256px, collapsible to 64px icon rail (state persisted): Home, Inbox, Queue (pending-count badge, realtime), Clients, Plans, Analytics, Library, Settings; org logo top; user menu bottom
- Topbar: breadcrumbs, global search trigger, quick actions (+ invite client, + new plan)
- ⌘K palette (cmdk): navigate anywhere, search clients by name (fuzzy), actions ("approve next draft", "invite client", "toggle theme")
- Full keyboard nav, visible focus rings everywhere, skip-links; light+dark from theme tokens only
- Information density: comfortable 8px-grid padding, text-sm base, tabular numerals class on ALL numbers

Screenshot loop (§② step 4) on the shell at desktop/tablet/dark. Commit: "feat(dash): design harness + final shell".
```

### 7.2 — Home: the morning digest screen

```
Load frontend-design + dataviz skills. This screen IS the product's daily habit loop (spec §13) — a trainer opens it with coffee and knows their whole roster in 60 seconds.

Build /trainer (home):
- Top strip: 4 KPI stat cards (Active clients, Pending items, Avg adherence this week w/ 7-day sparkline, MRR — stub until P8), each with delta vs last week, tabular numerals, shadcn chart sparklines
- "Needs you today" (the digest, P6.5 data): ordered action list — escalations (danger accent, always top), drafts pending (grouped: replies/plans/splits/progressions with count chips), renewals due this week, at-risk clients (churn radar teaser) — each row: client avatar, one-line context, primary action button inline (approve/open), estimated total "clear your queue: ~12 min"
- "On track" collapsed section: everyone else, green-dot grid by client, hover = mini scorecard popover
- Empty states designed (new trainer: friendly setup pointers; all-clear: a genuinely nice "queue zero" moment — this is the screen they screenshot)
- Realtime: counts update live (Supabase subscription on queue views)

Screenshot loop, 2 passes, then move on. Commit: "feat(dash): morning digest home".
```

### 7.3 — Global review queue

```
Load frontend-design skill. Build /trainer/queue — the approve-everything-fast surface:
- Segmented tabs: All | Replies | Diet plans | Splits | Progressions | Escalations | Flags (failed payments stub, stalled onboarding P2 events); counts per tab, URL-state (shareable/back-button correct)
- Queue list: virtualized rows — client, type icon, age (SLA-colored after threshold), one-line preview; keyboard: j/k navigate, enter opens, a approves (where one-tap-safe), e edit
- Detail pane (split view, list stays visible): renders the right editor inline — reply draft card (P6.4), plan review (P4.3 embedded), split review (P5.3 embedded), escalation view (full thread context + "reply personally" jump)
- Bulk where safe: approve multiple reminder-level items; NEVER bulk on plans/escalations
- Queue-zero state: designed (see 7.2); session stats toast ("cleared 14 items in 9 min")
- Every action optimistic + undoable (5s toast undo) except sends (confirm-less but not undoable — label clearly)

Playwright: keyboard flow end-to-end, URL state, undo. Screenshot loop. Commit: "feat(dash): global review queue".
```

### 7.4 — Per-client inbox (the centerpiece)

```
Load frontend-design skill. Read docs/plan/ORIGINAL-SPEC.md §8 "per-client inboxes" — this three-in-one view is the spec's centerpiece trainer surface.

Build /trainer/clients/[id]/inbox — three-pane responsive layout:
- LEFT (thread): the P6 conversation, coach-side composer with voice-note record, drafted-reply cards inline at their trigger point ([Approve & Send][Edit][Rewrite]), jump-to-escalation pins
- RIGHT-TOP (client context, always visible): photo, tier badge, adherence score w/ 4-week trend sparkline, current weight + trend arrow, plan day-type today, fast window if active, quick actions (view plan, view split, log note)
- RIGHT-BOTTOM (to-do tracker, P6/P4/P5/P8 data): pending drafts for THIS client, renewal countdown, missed-log flags (3+ days), consent/onboarding stalls (P2 events), failed payment (stub) — each with inline resolve action
- Mobile: panes become swipeable tabs (thread default)
- Realtime on all three panes; thread scroll-anchored correctly (no jump on new message)

This screen gets THREE screenshot-loop passes — it's where trainers live. Consider a v0 alternative-treatment comparison if first pass feels generic. Commit: "feat(dash): per-client inbox".
```

### 7.5 — Roster + forensic client profile

```
Load frontend-design + dataviz skills. Build the roster and the dispute-ender view:

/trainer/clients (roster):
- openstatus-pattern data table (TanStack v8 + shadcn): server-side sort/filter/paginate, URL state, faceted filters (status, tier, adherence band, at-risk, renewal window), column visibility, saved views ("slipping", "renewals this week"); row: avatar+name, tier, adherence % (colored band dot, not red walls), weight trend sparkline (tiny), last activity, next renewal, ⋯ menu
- Bulk-action bar on selection: send check-in card, pause reminders, export selected

/trainer/clients/[id] (profile — the forensic ledger, trainer lens):
- Header: identity, tier, dates, quick nav (inbox | plan | split | photos | files)
- THE SIGNATURE VIZ (visx, the one bespoke piece): adherence forensic grid — GitHub-contribution-style calendar, one cell per day per expectation row (meals/weigh-in/training/check-in), states: logged/late/missed/not-expected; hover = that day's detail; month zoom = pattern annotations from P3 (weekend faller etc.). Make it beautiful AND printable (dispute-ender = show the client)
- Weight chart (shadcn/Recharts): logged weigh-ins + trend line + plan-phase annotations (plan v1→v2 markers); photo timeline strip beneath (progress photos, side-by-side compare mode)
- Working-set compliance panel: per-exercise progression mini-charts (last 8 sessions)
- Notes tab (trainer private notes, timestamped); Files tab (consent PDF, plan PDFs, exports)

Screenshot loop ×2. Commit: "feat(dash): roster + forensic client profile".
```

### 7.6 — Business analytics + churn radar

```
Load dataviz skill. Build /trainer/analytics:
- Revenue block (stubs until P8, real queries wired then): MRR, revenue by tier donut, upcoming renewals calendar strip
- Roster health: adherence distribution histogram, avg score trend, logging-method mix, response-time-to-drafts (their own SLA mirror)
- Churn radar (MASTER-PLAN feature 10): risk model in CODE (weighted: adherence slope 14d, logging gaps, message sentiment trend from a nightly Haiku batch classify, renewal proximity, payment fails) → ranked at-risk list with primary driver shown ("logging stopped 6 days ago") + one-click actions (send check-in card, open inbox, draft re-engagement — Sonnet draft to queue)
- Zero-edit rate panel (their AI quality, from Langfuse-mirrored table): drafts approved unedited % by type, trending — shows the product learning THEM (retention/moat made visible)
- Time-saved estimate card (marketing-honest math: drafts approved × avg typing time saved) — the ROI screenshot they share

All charts shadcn/Recharts, token colors, tabular numerals, skeleton loaders matching final geometry. Commit: "feat(dash): analytics + churn radar".
```

### 7.6b — Monthly client progress report (MASTER-PLAN feature 3)

```
Load frontend-design + dataviz skills. Build the auto-generated monthly progress report (the trainer-forwards-it, client-posts-it marketing loop):
- Nightly job (Batch API window): clients completing a plan month → assemble report data IN CODE from P3 series: weight trend chart, adherence score + streak highlights, strength PRs (top-set improvements from workout_logs), photo side-by-side (first vs latest, only if client opted in), coach's note slot (AI-drafted 2-liner in trainer voice → a drafts row with message_id null — add a migration making drafts.message_id nullable + kind='report_note'; approval flows through the normal P6.4 queue, edits captured via draft_edits entity_type='reply')
- Outputs: branded PDF (react-pdf, same brand system as P4.5, trainer socials footer) + a square share-card image (og-image pipeline, satori or similar — verify current best via context7) with client-controlled anonymization (first name only / initials / hidden)
- Delivery: trainer approves the coach's note in the queue → report lands in client thread (kind=plan_delivery) + portal Files; client gets "share your month" action (native share sheet) — sharing is ALWAYS the client's choice, never automatic
- Report on/off is org-level; photo inclusion is per-client consent (explicit toggle, default off)

Tests: report data matches hand-computed fixtures; anonymization levels; opt-out paths. Commit: "feat(reports): monthly progress report + share card".
```

### 7.7 — The polish gate (the "10 years" pass)

```
Load frontend-design skill. Run the final quality gate across ALL trainer + portal screens (docs/plan/research/dashboard-ui.md Recipe steps 8-10):

1. Unhappy paths audit: EVERY screen has designed empty (illustration + CTA), loading (skeletons matching real geometry), and error (inline retry) states — list every screen, verify each, fix gaps
2. Interaction audit: optimistic updates everywhere mutations happen; focus-visible on all interactives; keyboard-complete flows (tab through queue→approve without mouse); hover transitions 150-200ms ease-out only; zero scroll-triggered animation
3. Consistency sweep (automated where possible): grep for arbitrary Tailwind values (spacing outside scale), non-token colors, radius violations, missing tnum on numeric columns — fix all
4. Accessibility gate: axe-core on every route (zero AA violations), contrast verification light+dark, prefers-reduced-motion respected
5. Performance gate: Lighthouse ≥90 performance on home/queue/inbox with realistic seeded data (100 clients, 5k messages — write the load-seed script); virtualization verified on long lists; chart render <100ms
6. Final screenshot review: full-app walkthrough screenshots (desktop+mobile+dark) → one self-critique pass against DESIGN.md → fix list → execute → re-shoot
7. Run /security-review across the dashboard routes (queue actions are mutation-heavy)

Then: snapshot plugin baseline on all polished screens (visual regression from here on).
Commit: "polish(dash): 10-year pass". Update PROGRESS.md: Phase 7 complete.
```

## ⑥ Definition of done → handoff

- [ ] Morning ritual works end-to-end on demo org: open home → clear queue → inbox a client → under 10 min, keyboard-only possible
- [ ] Design harness enforced by lint+hooks (hex/spacing violations = CI failures)
- [ ] Forensic grid renders 12 months × 4 expectations instantly (virtualized), printable
- [ ] All screens pass the 7.7 gate; snapshot baselines locked
- [ ] Realtime freshness: queue counts, inbox threads, home digest all live-update
- [ ] Monthly progress report generates for the demo client; share-card anonymization levels verified
- **Handoff to Phase 8:** billing flags/MRR/renewal surfaces are rendered stubs wired to views — Phase 8 fills them with Stripe data. The tier cards (P1) and teaser unlock (P2) get real checkout.
