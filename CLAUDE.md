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
```

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
- Design tokens are semantic CSS variables — components never hardcode colors; 4px spacing grid; radii: 6px inputs, 10px cards. Chrome is achromatic; color is reserved for state (success/warning/danger). Surfaces: background → surface (sidebars, wells) → surface-raised (cards).
- Numeric displays always use the `metric` utility (semibold tabular numerals) with a `metric-label` eyebrow; every screen renders EmptyState / Skeleton / ErrorBoundary (packages/ui) before its data exists.
- Observability (Phase 0.5, all no-op without keys): errors → Sentry (`instrumentation*.ts` + `sentry.*.config.ts`); product events → PostHog — client via `track()` from `@supertrainer/ui/analytics`, server via `trackServer()` (`apps/web/lib/analytics/server.ts`) which ALSO writes the `events` table. Every Claude call is auto-traced to Langfuse through `getClaudeClient()`; call `await flushTracing()` after AI work in serverless handlers. CI/CD lives in `.github/workflows/` (PR = typecheck/lint/RLS/e2e; main = DB migrations behind a `production` approval gate). App deploys run through Vercel's Git integration (prod on main, preview per PR), not Actions. One-time account/secret setup: `docs/ci-cd-observability.md`.
