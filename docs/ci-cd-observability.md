# CI/CD & Observability — setup runbook (Phase 0.5)

Phase 0.5 wired the **code** for CI/CD and observability. The steps below are the
one-time **account / dashboard / repo** actions that need a human with the right
logins — do them once, then the pipeline and tracing light up automatically.

Everything degrades gracefully until then: with no keys set, Sentry/PostHog/
Langfuse no-op and local dev, `npm run build`, and tests all run unchanged.

---

## 1. GitHub repository

The repo currently has **no remote**. Create one and push:

```bash
gh repo create supertrainer --private --source . --remote origin
git push -u origin main
```

## 2. Secrets (repo Settings → Secrets and variables → Actions)

Only the migration workflow (`migrate.yml`) needs secrets — app deploys run
through Vercel's Git integration, not Actions.

| Secret | Where to get it |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Supabase → Account → Access Tokens |
| `SUPABASE_PROJECT_REF` | Supabase project ref (dashboard URL / Settings → General) |
| `SUPABASE_DB_PASSWORD` | the DB password set at project creation (Settings → Database to reset) |

CI (`ci.yml`) needs **no secrets** — it spins up a throwaway local Supabase.

## 3. Vercel project (Git integration)

Import the repo in the Vercel dashboard (New Project → import
`virk173/supertrainer`):
- **Root Directory: `apps/web`** — critical; it's a Turborepo monorepo.
- Framework preset: **Next.js** (auto-detected).
- Add the **runtime** env vars from `.env.example`: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_APP_URL`, plus the observability keys when
  set up. Add the **build-time** Sentry vars (`SENTRY_ORG`, `SENTRY_PROJECT`,
  `SENTRY_AUTH_TOKEN`) so source maps upload during the Vercel build.

Vercel then deploys production on every push to main and a preview on every PR.

> Ordering note: production deploy and the gated migration run independently on
> merge — fine for backward-compatible (expand-contract) migrations. For strict
> migrate-before-serve ordering, disable Vercel's production auto-deploy and
> trigger it via a Vercel Deploy Hook at the end of the migrate job.

## 4. Observability dashboards

- **Sentry** — create a Next.js project; copy the DSN into `SENTRY_DSN` and
  `NEXT_PUBLIC_SENTRY_DSN`. Create an org auth token (Settings → Auth Tokens,
  `project:releases` scope) → `SENTRY_AUTH_TOKEN`; set `SENTRY_ORG` /
  `SENTRY_PROJECT` to your slugs. Release/environment are auto-tagged from Vercel.
- **PostHog** — create a project; copy the project API key into
  `NEXT_PUBLIC_POSTHOG_KEY` and set `NEXT_PUBLIC_POSTHOG_HOST`
  (e.g. `https://us.i.posthog.com`). Browser pageviews/events and server events
  share this one key; the server side also writes the `events` table.
- **Langfuse** — create a project; copy the public/secret keys into
  `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` (and `LANGFUSE_HOST` if
  self-hosted). **For cost to appear**, add model prices under Settings → Models
  for `claude-haiku-4-5`, `claude-sonnet-5`, and `claude-opus-4-8` (Langfuse
  computes cost from model + token usage).

## 5. Branch protection + migration gate

- **Migration gate** — `migrate.yml` is **manual only** (`workflow_dispatch`):
  nothing hits prod until you run it from Actions → *Migrate (production DB)* →
  *Run workflow*. This is the free-tier gate and works on any plan.

- **Branch protection** — enforcing "CI must pass before merge" via GitHub
  **requires a public repo or GitHub Pro** (classic protection, rulesets, and
  environment required-reviewers are all Pro-gated on private repos). On a free
  private repo, CI still *runs* on every PR and reports pass/fail — you just
  self-enforce (don't merge a red PR). To turn on real enforcement later:

  ```bash
  # after making the repo public OR upgrading to GitHub Pro:
  gh api -X PUT repos/virk173/supertrainer/branches/main/protection --input - <<'JSON'
  {"required_status_checks":{"strict":true,"contexts":["Typecheck & lint","RLS + E2E (local Supabase)"]},
   "enforce_admins":false,"required_pull_request_reviews":{"required_approving_review_count":0},"restrictions":null}
  JSON
  ```
  Then optionally add required reviewers on the `production` environment and
  switch `migrate.yml` back to a `push`-triggered gate.

## 6. Verify (Phase 0.5 DoD)

1. Open a trivial PR → both CI jobs go green (typecheck/lint, and RLS + E2E).
2. Merge → Vercel deploys production (its Git integration); the `migrations`
   job pauses for approval → approve → `db push` runs.
3. Hit `GET /api/debug/sentry` on the deployed URL → a **Sentry test event**
   appears (returns 501 until `SENTRY_DSN` is set).
4. Load any page → a **$pageview** appears in PostHog (and the browser network
   tab shows a request to the PostHog host).
5. Once an AI call runs (Phase 1+), a traced generation appears in Langfuse with
   model, latency, tokens, and cost.
