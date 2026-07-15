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

| Secret | Used by | Where to get it |
|---|---|---|
| `VERCEL_TOKEN` | deploy.yml | Vercel → Account Settings → Tokens |
| `VERCEL_ORG_ID` | deploy.yml | `.vercel/project.json` after `vercel link`, or Vercel project settings |
| `VERCEL_PROJECT_ID` | deploy.yml | same as above |
| `SUPABASE_ACCESS_TOKEN` | deploy.yml | Supabase → Account → Access Tokens |
| `SUPABASE_PROJECT_REF` | deploy.yml | Supabase project ref (dashboard URL / Project Settings) |
| `SUPABASE_DB_PASSWORD` | deploy.yml | Supabase → Project Settings → Database |

CI (`ci.yml`) needs **no secrets** — it spins up a throwaway local Supabase.

## 3. Vercel project

`vercel link` (or import the repo in the Vercel dashboard) to create the project,
then set the **runtime** env vars in Vercel (Project → Settings → Environment
Variables) from `.env.example`: the `NEXT_PUBLIC_SUPABASE_*`,
`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, and the observability keys
below. Also set the **build-time** Sentry vars (`SENTRY_ORG`, `SENTRY_PROJECT`,
`SENTRY_AUTH_TOKEN`) so source maps upload during the Vercel build.

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

## 5. Branch protection + approval gate

- **Branch protection** (Settings → Branches → add rule for `main`): require PRs,
  and require the CI checks **"Typecheck & lint"** and **"RLS + E2E"** to pass.

  ```bash
  gh api -X PUT repos/:owner/supertrainer/branches/main/protection \
    -H "Accept: application/vnd.github+json" \
    -f 'required_status_checks[strict]=true' \
    -f 'required_status_checks[contexts][]=Typecheck & lint' \
    -f 'required_status_checks[contexts][]=RLS + E2E (local Supabase)' \
    -F 'enforce_admins=true' \
    -F 'required_pull_request_reviews[required_approving_review_count]=1' \
    -F 'restrictions=null'
  ```

- **Migration approval gate** (Settings → Environments → new environment
  `production`): add yourself as a **required reviewer**. `deploy.yml`'s
  `migrations` job targets this environment, so every `supabase db push` to prod
  pauses for a click before running; the Vercel deploy waits on it.

## 6. Verify (Phase 0.5 DoD)

1. Open a trivial PR → both CI jobs go green (typecheck/lint, and RLS + E2E).
2. Merge → the `migrations` job waits for approval → approve → `db push` runs →
   Vercel production deploy completes.
3. Hit `GET /api/debug/sentry` on the deployed URL → a **Sentry test event**
   appears (returns 501 until `SENTRY_DSN` is set).
4. Load any page → a **$pageview** appears in PostHog (and the browser network
   tab shows a request to the PostHog host).
5. Once an AI call runs (Phase 1+), a traced generation appears in Langfuse with
   model, latency, tokens, and cost.
