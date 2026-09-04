# Load testing (Phase 9.6)

The point of this suite is not a number to put on a slide. It is to find the
place this product breaks first, before a real coach's Monday morning does.

**Everything here runs against STAGING.** `seed.mjs` refuses a URL that doesn't
look like staging unless you pass `--i-know`, because a hundred fake orgs are
very hard to unpick from a real database.

## 1. Seed the fixture

```bash
export NEXT_PUBLIC_SUPABASE_URL=…        # staging
export SUPABASE_SERVICE_ROLE_KEY=…
export NEXT_PUBLIC_SUPABASE_ANON_KEY=…
node load/seed.mjs --orgs 100 --clients 50
```

Writes `load/fixture.json`: org ids, client ids, and real access tokens for a
sample of trainers so the read tests go through RLS exactly as a browser does.
Every seeded row is tagged with a run id — the script prints how to remove them.

## 2. Run the scenarios

```bash
k6 run -e SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL -e ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY load/k6/api-read.js
k6 run -e BASE_URL=https://staging… -e CRON_SECRET=… load/k6/cron-fanout.js
k6 run -e SUPABASE_URL=… -e ANON_KEY=… -e SERVICE_KEY=… load/k6/message-storm.js
```

## SLOs, and what failing each one means

| Scenario | SLO | If it fails, look here first |
|---|---|---|
| `api-read` | p95 < 400ms, <1% errors | Connection pooling (Supabase pooler mode + pool size), then the index on the `(org_id, …)` predicate of the slow query. Read the slow-query log before touching application code. |
| `cron-fanout` | every tick well inside its `maxDuration`, zero non-2xx | Batch windows. The fan-out jobs process every org in one tick; the fix is chunking with a cursor, not a bigger timeout. |
| `message-storm` | p95 write < 400ms, <1% errors | Realtime publication size and trigger cost on `messages`. |

## The realtime half

k6 has no Supabase realtime client, so the "a subscriber sees it within 2s"
half of the storm SLO is measured by a separate listener rather than faked here:

```bash
node load/listen.mjs   # subscribes, prints observed write→deliver latency
```

Run it alongside `message-storm.js` and read the p95 it prints.

## What this suite does NOT cover

- Cold starts. Measure those on a real deployment with real traffic patterns.
- Storage throughput (progress photo uploads).
- Stripe webhook bursts — exercised deterministically by the signed-fixture e2e
  tests instead, which is a better tool for "zero dropped webhooks" than load.
