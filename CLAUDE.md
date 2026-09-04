# supertrainer — project memory

AI coaching platform for personal trainers. Full spec and phase plans: **docs/plan/** (start at `docs/plan/00-MASTER-PLAN.md`; current phase status in `docs/plan/PROGRESS.md`). Start each session by checking PROGRESS.md and this file.

## Standing rules (non-negotiable)

1. **All DB access goes through `packages/db`** — no raw Supabase clients constructed elsewhere.
2. **All AI calls go through `packages/ai` `modelRouter(task)`** — never hardcode a model id at a call site.
3. **Every new table ships with RLS policies + a policy test in the same PR.** No exceptions. Supabase grants API roles NOTHING on new tables by default — every table migration must also include an explicit `grant` block (see `supabase/migrations/20260715130200_rls_policies.sql` for the pattern).
4. **No LLM ever does arithmetic** — money and macros are computed in code; the LLM only selects/structures.
5. **Zod-validate every AI output** — use `zodOutput()` from `packages/ai`; never consume unvalidated model output.

## Architecture (locked — docs/plan/00-MASTER-PLAN.md §3)

| Layer | Choice |
|---|---|
| Web app | Next.js 15+ (App Router, TS strict) on Vercel |
| UI | Tailwind v4 + shadcn/ui (neutral) + Tremor charts; Geist font |
| DB/Auth/Storage/Realtime | Supabase (Postgres 16, RLS, Realtime, Storage, Edge Functions) |
| Multi-tenancy | Single DB, `org_id` on every row + RLS policies; org_id JWT custom claim via auth hook |
| Jobs | pg_cron + pgmq (Supabase); Vercel cron as backup tick |
| AI | Claude API — Haiku 4.5 (parse/classify), Sonnet 5 (drafts), Opus tier (plan generation, style ingestion); prompt caching + Batch API for nightly jobs |
| AI plumbing | Claude Agent SDK for plan pipeline; Zod-validated structured outputs everywhere |
| LLM observability | Langfuse (traces + evals; zero-edit-rate metric) |
| Payments | Stripe Connect (Express) + Billing + Tax — Phase 8 |
| Mobile/Push | PWA first + Web Push (VAPID); email digest fallback (Resend); Expo wrapper v1.5 |
| E-sign | Click-wrap consent with hash + timestamp + IP (Documenso if needed) |
| PDFs | react-pdf/renderer server-side |
| Errors/analytics | Sentry + PostHog |
| Search | Postgres FTS |

## Monorepo layout (Turborepo, npm workspaces)

```
apps/web          Next.js app (App Router). Imports the three packages below.
packages/db       Supabase client factories + generated types.
                  Import from "@supertrainer/db/server" | "/browser" | "/types".
                  Types regenerated via: npx supabase gen types typescript --local > packages/db/src/types.ts
                  Migrations live in supabase/migrations (packages/db/migrations is a symlink);
                  pgTAP RLS tests in supabase/tests (packages/db/tests is a symlink), run via `npx supabase test db`.
                  JWT claims (org_id, user_role) come from public.custom_access_token_hook — RLS policies
                  read them via public.jwt_org_id() / public.jwt_user_role() / public.is_org_staff().
packages/ui       Design tokens (src/styles/globals.css) + shared shadcn components.
                  apps/web/app/globals.css imports "@supertrainer/ui/globals.css".
                  shadcn CLI installs shared components here (aliases in components.json).
packages/ai       Claude client (claude.ts), modelRouter(task), zodOutput(schema, params).
                  Task types: parse | classify | draft | plan | ingest.
docs/plan         The build plan — phase prompts reference these paths.
docs/runbooks     One page per thing that can go wrong (restore, webhook outage, push down, AI down).
load              k6 load suite + seeder + realtime listener (staging only; see load/README.md).
scripts           Repo tooling. scan-client-bundle.mjs is a CI job: builds into .next-scan and
                  fails if a server-only secret's VALUE reaches the browser bundle.
```

## Phase 9 additions (launch)

- **Data registry** (`apps/web/lib/data/registry.ts`) — EVERY public table must be classified
  here (scope, exported, delete order). A live-schema diff test fails CI on an unclassified
  table; that guard is what stops personal data silently surviving a purge. Adding a table?
  Classify it in the same PR.
- **Platform console** (`/admin`) — platform-operator only: listed in `platform_admins` AND a
  live WebAuthn elevation. Its ten tables have RLS on and NO grant to any API role. Never add
  one.
- **AI margin meter** — every Claude call is priced in code (`@supertrainer/ai/pricing`, integer
  micros) and billed to the org whose work it was. New AI entry points should be wrapped in
  `forOrg(orgId, …)` (`lib/admin/attribution.ts`) or they land unattributed.
- **Feature flags** — `flag(orgId, key)` from `lib/admin/flags.ts`. Deterministic per-org ramp;
  unknown flags are OFF (never fail open). Every rollout from here on goes through one.
- **Marketing prices** live only in `lib/marketing/pricing.ts` (placeholders pending a decision);
  competitor figures in `lib/marketing/competitors.ts` carry a source URL + checked date, and
  anything unverifiable is omitted rather than estimated.

## Command cheatsheet

| Command | Notes |
|---|---|
| `npm run dev` | All dev servers via turbo (web on :3000) |
| `npm run typecheck` | `tsc --noEmit` in every workspace |
| `npm run lint` / `npm run test` / `npm run build` | via turbo |
| `npx supabase start` / `stop` | Local stack (Docker) — from Phase 0.2 |
| `npx supabase db reset` | Re-apply all migrations + seed |
| `npx supabase gen types typescript --local` | Regenerate `packages/db/src/types.ts` after every migration |
| `npx shadcn@latest add <component> -c apps/web` | Adds shared components into packages/ui |

## Conventions

- Server components + server actions by default; route handlers only for webhooks/streaming (no tRPC).
- Service-role Supabase client (`createSupabaseServiceRoleClient`) is server-only — never import into client components.
- `NEXT_PUBLIC_*` env vars are browser-exposed; secrets never get that prefix. Every env var is documented in `.env.example`.
- Design tokens are semantic CSS variables — components never hardcode colors (a hex literal is an ESLint error; see DESIGN.md); 4px spacing grid; ONE 8px radius for every box, `rounded-full` for pills/avatars (Phase 7 DESIGN.md — supersedes the old 6px/10px split). Chrome is achromatic; color is reserved for state (success/warning/danger). Surfaces: background → surface (sidebars, wells) → surface-raised (cards).
- Numeric displays always use the `metric` utility (semibold tabular numerals) with a `metric-label` eyebrow; every screen renders EmptyState / Skeleton / ErrorBoundary (packages/ui) before its data exists.
- Observability (Phase 0.5, all no-op without keys): errors → Sentry (`instrumentation*.ts` + `sentry.*.config.ts`); product events → PostHog — client via `track()` from `@supertrainer/ui/analytics`, server via `trackServer()` (`apps/web/lib/analytics/server.ts`) which ALSO writes the `events` table. Every Claude call is auto-traced to Langfuse through `getClaudeClient()`; call `await flushTracing()` after AI work in serverless handlers. CI/CD lives in `.github/workflows/` (PR = typecheck/lint/RLS/e2e; main = DB migrations behind a `production` approval gate). App deploys run through Vercel's Git integration (prod on main, preview per PR), not Actions. One-time account/secret setup: `docs/ci-cd-observability.md`.

## DESIGN.md — the dashboard design law (Phase 7, non-negotiable)

The one rulebook that makes every session look like a single designer over ten years. It refines the Phase 0.4 conventions above — where they differ, **this section wins**. Enforced by lint (`no-restricted-syntax` hex rule) + the PostToolUse typecheck/lint hook.

- **Type.** Geist Sans for everything on screen; Geist Mono (via the `metric` utility / `tabular-nums`) for every number. Two weights only: `font-medium` (labels, nav, body emphasis) and `font-semibold` (metrics, headings). App-chrome base is `text-sm`; page titles `text-lg`/`text-xl` semibold, never larger in the console.
- **Spacing.** 4px grid. Use only the set **{4, 8, 12, 16, 24, 32, 48}** (Tailwind `1 2 3 4 6 8 12`). No arbitrary spacing values (`p-[13px]` etc.) — the ESLint arbitrary-value guard and self-review catch these.
- **Radius.** **ONE radius: 8px** (`--radius`, and `rounded-md`/`rounded-lg`/`rounded-input`/`rounded-card` all resolve to it) for every box: cards, inputs, buttons, wells, popovers, menus, the command palette. `rounded-full` is reserved for pills (badges), avatars, and status dots. No other radii exist — no `rounded-sm`, no `rounded-xl` boxes.
- **Borders & elevation.** 1px borders, always the `border` token (never a raw color, never a heavier width). Prefer a **hairline divider over a nested box or a shadow.** Elevation is the surface ramp only: `background` (page) → `surface` (sidebar, wells, tab bars) → `surface-raised` (cards, popovers). Shadows never exceed `shadow-sm`; a hairline is the default separator. No gradients, ever.
- **Color.** The chrome is **achromatic**. The single accent is the ink `primary` (near-black in light / near-white in dark) — the primary button and the active nav chip, nothing else. The semantic trio `success` / `warning` / `danger` (+ `warning-text` for amber-on-light) appears **only to signal client state** (adherence hit / drift / missed, escalations, SLA breach, failed payment). A colored mark always means something true about a client — never decoration, never brand flair. (Trainer brand color is a data-driven exception confined to PDFs/emails/manifest/OG — see the ESLint whitelist.)
- **Motion.** Hover and color transitions **150–200ms ease-out only**. No scroll-triggered animation, no entrance choreography in-app. `prefers-reduced-motion` is honored wholesale (already wired in globals.css).
- **Numbers.** Every numeric value wears `metric` (semibold tabular-nums); its eyebrow wears `metric-label`. Money and macros are computed in code before they reach the UI (standing rule 4) — the UI only formats.
- **Microstates.** Every screen ships a designed **empty** (illustration/icon + one CTA, interface voice), **loading** (skeleton matching the real geometry), and **error** (inline, retryable) state before its data exists. This is the biggest "10 years of polish" tell (dashboard-ui.md Recipe step 8).
- **A11y floor.** Visible `focus-visible` ring on every interactive (use `focusRing` or the Button/Input variants); keyboard-complete flows; skip-link to main; AA contrast in both themes; zero horizontal overflow at 375/768/1280. Verified by axe-core in the screenshot loop.

Copy voice: sentence case, active voice, name things by what the trainer controls; an action keeps its label through its whole flow (a "Publish" button yields a "Published" toast).
