# supertrainer

AI coaching platform for personal trainers — adherence ledger, AI diet/split generation, trainer-approved messaging, and payments. Built as a Turborepo monorepo on Next.js + Supabase + the Claude API.

The full product spec and phase-by-phase build plan live in [docs/plan/](docs/plan/) — start with [docs/plan/00-MASTER-PLAN.md](docs/plan/00-MASTER-PLAN.md).

## Monorepo layout

```
apps/web       Next.js 15 (App Router, TS strict, Tailwind v4, shadcn/ui)
packages/db    Supabase client factories (server/browser/service-role) + generated types
packages/ui    Design tokens + shared shadcn components
packages/ai    Claude client, modelRouter(task), zodOutput() validated-JSON helper
docs/plan      Product spec + phase build plans (source of truth for scope)
```

## Local dev quickstart

Prereqs: Node ≥ 22 (Supabase JS needs a native WebSocket), npm ≥ 10, Docker (for Supabase local, from Phase 0.2 on).

```bash
npm install                 # install all workspaces
cp .env.example .env.local  # fill in values (see comments in the file)
npm run dev                 # boots apps/web on http://localhost:3000
```

Supabase local stack (available after Phase 0.2 lands migrations):

```bash
npx supabase start          # local Postgres + auth + storage on Docker
npx supabase db reset       # re-apply all migrations from scratch
```

## Commands

| Command             | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Dev servers for all apps (Turborepo)          |
| `npm run build`     | Production build                              |
| `npm run typecheck` | `tsc --noEmit` across every workspace         |
| `npm run lint`      | ESLint across every workspace                 |
| `npm run test`      | Test suites across every workspace            |

## CI / Deploy

- **Production:** https://supertrainer-web.vercel.app (Vercel, auto-deploys on merge to `main`; preview deployment per PR).
- **CI** (`.github/workflows/ci.yml`, on every PR): typecheck + lint, plus a local-Supabase job running the pgTAP RLS tests and Playwright smoke suite.
- **Migrations** (`.github/workflows/migrate.yml`): manually triggered (`workflow_dispatch`) `supabase db push` to production.
- One-time account/secret setup is documented in [docs/ci-cd-observability.md](docs/ci-cd-observability.md).

## Standing rules

See [CLAUDE.md](CLAUDE.md) — architecture decisions and the non-negotiable build rules (RLS on every table, all AI through `packages/ai`, no LLM arithmetic, Zod-validate every AI output).
