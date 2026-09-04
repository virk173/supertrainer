# Observability & SLOs

What we watch, what counts as broken, and who finds out. Everything below is
no-op-safe without credentials, so a missing key degrades observability rather
than the product.

## Service level objectives

| SLO | Target | Measured by | Why this number |
|---|---|---|---|
| API read latency | p95 < 400ms | k6 `api-read`, Vercel analytics | Above this the roster grid feels laggy on mobile data |
| Realtime message delivery | p95 < 2s | `load/listen.mjs`, PostHog client event | A chat that lags feels broken even when nothing is lost |
| Webhook processing | zero dropped events | `webhook_events` rows with `processed_at IS NULL` older than 1h | A dropped event is a client locked out of coaching they paid for |
| Cron completion | every daily tick completes | Vercel cron logs; each route returns a JSON summary | A silent cron is how adherence data quietly stops existing |
| Draft turnaround | p95 < 60s from client message to draft in queue | `drafts.created_at` − `messages.created_at` | Beyond a minute the trainer starts answering manually |
| Error rate | < 0.5% of requests | Sentry | — |

## Alerts to configure

These are dashboard settings, not code. Configure them before launch and record
the date here.

**Sentry** (`SENTRY_*`)
- [ ] Error spike: >20 events in 5 minutes on `production` → email + phone
- [ ] Any unhandled error in `app/api/webhooks/**` → immediate, no batching
- [ ] Any error in `app/api/cron/**` → daily digest is enough (they retry tomorrow)
- [ ] New issue type in `lib/payments/**` → immediate (money code)

**PostHog** (`NEXT_PUBLIC_POSTHOG_KEY`)
- [ ] Launch dashboard: signups, activation-checklist completion, first client
      added, first plan approved, first payment
- [ ] Retention: weekly active trainers, weekly active clients
- [ ] Funnel alert: activation completion drops below 40% week-over-week

**Langfuse** (`LANGFUSE_*`)
- [ ] Cost alert at 80% of the monthly platform AI budget
- [ ] Zero-edit rate tracked per org (it is the product's core quality metric —
      the `/admin/orgs` column reads the same underlying data)

**Uptime** (any external monitor — the point is that it is not us)
- [ ] `https://<platform>/` (marketing) — 5 min
- [ ] `https://<platform>/login` (app shell) — 5 min
- [ ] A branded portal URL — 5 min
- [ ] Alert to phone, not email

## What we deliberately do not alert on

- Individual AI call failures. They retry, fall back a tier, and degrade to the
  trainer answering personally — which is the pre-AI baseline, not an incident.
- A single failed push. Expired subscriptions are normal; the `push_degraded_at`
  flag and the portal banner handle it without waking anyone.
- Budget throttles. An org crossing its AI cap is the system working.

## The one metric that matters

Zero-edit rate: the share of drafted replies a trainer sends untouched. If it
climbs, the style layer is working and the product is worth its price. If it
falls, nothing else on this page will save us. It is on `/admin/orgs` per org and
in the trainer's own analytics.
