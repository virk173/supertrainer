# PHASE 0 — Foundations & The Uninterruptable Build Harness

**Ships:** Turborepo monorepo, Supabase project with full multi-tenant schema + RLS, auth, design system baseline, CI/CD, observability, and a Claude Code environment configured so long builds never stall on permissions or lost context.
**Feeds:** every later phase. Nothing else starts until Phase 0's Definition of Done passes.

---

## ① Learn first (60–90 min total — skim, don't memorize)

| Topic | Why you need it | Where |
|---|---|---|
| Supabase Row Level Security (RLS) | Every table is multi-tenant; one bad policy leaks a trainer's clients to another trainer | supabase.com/docs/guides/database/postgres/row-level-security |
| Next.js App Router data patterns (server components, server actions, route handlers) | You'll approve/reject Claude's architecture choices; know the vocabulary | nextjs.org/docs/app |
| Claude Code settings.json permission allowlists | This is what makes the build uninterruptable — pre-approve safe commands so 6-hour runs don't stop | code.claude.com/docs → Settings/Permissions |
| Claude Code hooks (PreToolUse, PostToolUse, Stop) | Auto-run typecheck+tests after edits; block dangerous commands; keep loops alive | code.claude.com/docs → Hooks |
| CLAUDE.md project memory | The file Claude reads every session — your architecture decisions live here so context survives restarts | code.claude.com/docs → Memory |
| Git worktrees basics | Parallel Claude sessions on separate branches without conflicts | superpowers:using-git-worktrees skill explains it |

## ② Claude Code setup (do once — this is the "uninterruptable" config)

**Plugins/skills you already have that this phase uses:** `supabase` plugin (needs `/mcp` auth in an interactive session — do this first), `vercel` plugin (auth it too), `context7` (current docs), `superpowers` (brainstorming/TDD/debugging process), `feature-dev`, `code-review`, `frontend-design`, `claude-mem` (session memory), `ralph-loop` (long autonomous runs).

**Plugins to INSTALL now (gaps found in July 2026 marketplace scan — see research/claude-plugins-skills.md):**
```
/plugin install github@claude-plugins-official        # PRs, issues, Actions monitoring
/plugin install typescript-lsp@claude-plugins-official # real TS diagnostics instead of grep
/plugin install playwright@claude-plugins-official     # browser automation for verification loops
/plugin install security-guidance@claude-plugins-official # reviews ~25 vuln classes as code is written
```
Install in Phase 7: shadcn MCP (`npx shadcn@latest mcp init --client claude`), optional `v0` + `snapshot`. Install in Phase 8: `stripe` plugin.

**Connectors/MCP to add:**
- Supabase MCP (comes with your supabase plugin — authenticate via `/mcp`)
- Vercel MCP (same)
- GitHub: `gh auth login` + the github plugin above
- Stripe MCP — Phase 8, not now

**Uninterruptable-build checklist:**
1. Create the repo and run `/init` so CLAUDE.md is generated; then paste the Architecture Decisions block (Prompt 0.1 output) into it.
2. Project `.claude/settings.json`: allow `npm run *`, `npx supabase *`, `git *` (except push to main), `gh *`, `npx turbo *`, `npx playwright *` — run the `fewer-permission-prompts` skill after a day of building to auto-generate this from your transcripts.
3. Add a PostToolUse hook: after any Edit/Write to `*.ts`/`*.tsx`, run `npm run typecheck --filter=...` (fast feedback beats end-of-run surprises).
4. Use `ralph-loop` for grind tasks (schema+RLS+tests) with a verifiable completion promise (e.g., "all migrations apply and `npm test` passes").
5. `claude-mem` is already capturing sessions; start each session with "check PROGRESS.md and CLAUDE.md first."
6. One feature = one branch = one worktree when running parallel sessions (`superpowers:using-git-worktrees`).

## ③ GitHub repos to use/reference

- [supabase/supabase](https://github.com/supabase/supabase) — reference for local dev (`supabase start`), migrations, RLS test patterns. Apache-2.0.
- [vercel/turborepo](https://github.com/vercel/turborepo) — monorepo runner (examples/with-tailwind is the layout to copy). MIT.
- [shadcn-ui/ui](https://github.com/shadcn-ui/ui) — component base for the whole app. MIT.
- [t3-oss/create-t3-turbo](https://github.com/t3-oss/create-t3-turbo) — reference monorepo structure (don't adopt tRPC blindly; use server actions). MIT.
- [supabase-community/supabase-custom-claims](https://github.com/supabase-community/supabase-custom-claims) — org_id claims pattern for RLS (verify current recommendation; Supabase now suggests JWT custom claims via auth hooks).
- [colinhacks/zod](https://github.com/colinhacks/zod) — schema validation everywhere (AI outputs, forms, env).
- [langfuse/langfuse](https://github.com/langfuse/langfuse) — LLM tracing/evals, self-hostable. MIT.
- [PostHog/posthog](https://github.com/PostHog/posthog) — product analytics, self-hostable. MIT.

## ④ Pipeline map

```
Inputs: nothing (greenfield)
Outputs consumed later:
  - packages/db (schema, migrations, RLS, typed client) → ALL phases
  - packages/ui (design tokens, shadcn base, layout shells) → P1,P2,P6,P7
  - packages/ai (Claude client, model router, Zod output helpers, Langfuse wrapper) → P1,P3,P4,P5,P6
  - Auth + org model (trainer=org owner, client=org member role) → P1,P2
  - CI (typecheck, lint, unit, RLS tests, Playwright smoke) → gatekeeper for every phase
Handoff to Phase 1: a deployed empty app where a trainer can sign up and see an empty dashboard shell.
```

## ⑤ Sub-phases — copy-paste prompts

> Run each prompt in Claude Code from the repo root. They're ordered; don't skip. Each assumes the previous one's Definition of Done passed.

### 0.1 — Architecture lock-in + repo scaffold

```
Read /Users/ranjeet/Claude Code/ai-coaching-platform-plan/00-MASTER-PLAN.md (§3 architecture table) and ORIGINAL-SPEC.md in the same folder for product context.

Scaffold a Turborepo monorepo named "supertrainer" in the current empty directory:
- apps/web: Next.js 15 App Router, TypeScript strict, Tailwind v4, shadcn/ui initialized (neutral base color), Geist font
- packages/db: Supabase client factory (server + browser), placeholder for generated types, drizzle NOT used — we use supabase-js + generated types
- packages/ui: shared shadcn components + design tokens file (spacing on 4px grid, radius, semantic colors for light+dark)
- packages/ai: empty package with a claude.ts client wrapper using @anthropic-ai/sdk, a modelRouter(task) function mapping task types {parse, classify, draft, plan, ingest} to model ids per MASTER-PLAN §4.3, and a zodOutput<T>() helper that requests JSON and validates with Zod, retrying once on validation failure
- Root: turbo.json with build/dev/lint/typecheck/test pipelines, .env.example listing every env var with comments, README with local-dev quickstart

Copy the entire plan folder "/Users/ranjeet/Claude Code/ai-coaching-platform-plan" into the repo at docs/plan/ — every later prompt references plan docs at docs/plan/ (e.g. docs/plan/PHASE-3-adherence-ledger.md).

Then write CLAUDE.md at repo root containing: the architecture table from MASTER-PLAN §3, the monorepo layout, command cheatsheet (dev/test/typecheck/migrate), and these standing rules: (1) all DB access goes through packages/db, (2) all AI calls go through packages/ai modelRouter, (3) every new table ships with RLS policies + a policy test in the same PR, (4) no LLM ever does arithmetic — money and macros are computed in code, (5) Zod-validate every AI output.

Verify: npm install succeeds, npm run typecheck passes, npm run dev boots apps/web showing a placeholder page. Commit as "chore: scaffold monorepo".
```

### 0.2 — Supabase project, core schema, RLS

```
Using the Supabase MCP and CLI (supabase init, supabase start for local), create the core multi-tenant schema as SQL migration files in packages/db/migrations. Read CLAUDE.md rules first.

Tables (all with created_at/updated_at, all org-scoped rows carry org_id uuid):
- orgs (id, name, slug, brand jsonb {logo_url, colors, socials}, settings jsonb)
- profiles (id = auth.users.id, org_id, role enum: owner|staff|client, display_name, timezone text NOT NULL default 'UTC', locale, avatar_url)
- clients (id, org_id, profile_id nullable until account claimed, status enum: lead|onboarding|active|paused|churned, source enum: teaser|invite|import, intake jsonb, health_flags jsonb, consent_signed_at, consent_doc_hash)
- audit_log (id, org_id, actor_profile_id, action, entity_type, entity_id, payload jsonb) — append-only
- events (id, org_id, client_id, type, payload jsonb, occurred_at) — the funnel/event spine every phase writes to

RLS: enable on ALL tables. Policies: owners/staff full access within their org_id; clients can select/update only their own rows (their profile, their client record) and nothing else; audit_log insert-only for authenticated, select for org owners; service role bypasses via server-only client. Use a JWT custom claim org_id set by an auth hook — implement the hook.

Write RLS tests in packages/db/tests using pgTAP or supabase test helpers: prove (a) trainer A cannot read trainer B's clients, (b) a client cannot read another client, (c) a client cannot read audit_log. Generate TypeScript types (supabase gen types) into packages/db.

Verify: supabase db reset applies all migrations cleanly, RLS tests pass, typecheck passes. Commit as "feat(db): core multi-tenant schema with RLS".
```

### 0.3 — Auth flows + org bootstrap

```
Implement authentication in apps/web using Supabase Auth (email OTP + Google OAuth):
- /signup and /login pages (shadcn forms, minimal, branded placeholder)
- Post-signup server action: create org, set user as owner, set org_id JWT claim, redirect to /onboarding (placeholder page)
- Client-role accounts do NOT get org-creation — they only come from invites/teaser (Phase 2); build the guard now: an invite token table (invites: id, org_id, client_id, token, expires_at, used_at) and /join/[token] page stub
- Middleware: route groups (app)/trainer/* requires role owner|staff, (app)/portal/* requires role client, marketing pages public
- Session handling per current Supabase SSR docs (use context7 to fetch them — do not rely on memory)

Playwright smoke test: signup → org created → lands on /onboarding; client role blocked from /trainer routes. Verify all tests pass and commit as "feat(auth): signup, login, org bootstrap, role guards".
```

### 0.4 — Design system baseline + app shells

```
Load the frontend-design skill and dataviz skill before writing any UI code.

Build the design foundation in packages/ui and apps/web:
- Design tokens: semantic CSS variables (background, surface, surface-raised, border, primary, success, warning, danger, muted) for light AND dark; 4px spacing grid; two radii (6px inputs, 10px cards); Geist Sans + tabular numerals for all metric displays
- App shells: (1) TrainerShell — left sidebar nav (collapsible, icons+labels: Home, Inbox, Clients, Plans, Queue, Settings), topbar with org switcher placeholder + avatar; (2) PortalShell — client mobile-first bottom-tab layout (Today, Plan, Log, Chat, Me); both responsive, both dark-mode ready
- Empty-state, loading-skeleton, and error-boundary components — every screen in later phases uses these three
- A /styleguide route rendering all tokens, components, and both shells for visual QA

Verify with Playwright screenshots (light+dark, mobile+desktop for portal shell) that nothing overflows and contrast passes WCAG AA (check with axe-core). Commit as "feat(ui): design system baseline and app shells".
```

### 0.5 — CI/CD + observability

```
Set up the delivery pipeline:
- GitHub Actions: on PR → typecheck, lint, unit tests, RLS tests (supabase db reset in service container), Playwright smoke; on main merge → Vercel production deploy (use vercel:deploy skill config), Supabase migrations applied via supabase db push in a deploy job with manual approval gate
- Sentry: apps/web client+server, source maps, release tagging
- PostHog: pageview + custom event helper track(event, props) in packages/ui, wired to the events table pattern (client-side PostHog, server-side both PostHog and events table)
- Langfuse: wrap packages/ai claude.ts so every call is traced (model, latency, tokens, cost, task tag); add .env.example entries
- Branch protection on main (PRs only, CI green required)

Verify: open a trivial PR, watch CI pass, merge, confirm production deploy + a Sentry test event + a PostHog test event arrive. Commit as "chore(ci): pipeline + observability".
```

## ⑥ Definition of done → handoff

- [ ] Fresh clone → `npm i && supabase start && npm run dev` works in <5 min following README
- [ ] All RLS tests green; trainer A provably cannot see trainer B's data
- [ ] Signup → empty trainer shell deployed on Vercel production URL
- [ ] /styleguide passes visual QA light+dark; axe-core AA clean
- [ ] CI blocks bad PRs; migrations deploy with approval gate
- [ ] CLAUDE.md contains architecture + standing rules; settings.json allowlist configured; typecheck hook active
- **Handoff to Phase 1:** the /onboarding placeholder page is where Phase 1's trainer activation flow begins.
