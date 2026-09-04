# Beta gate checklist

Every phase's definition of done, re-verified **on production** against the demo
org and one friendly-trainer org. Not on localhost, not on staging: the point is
to catch the things that only differ in production — env vars, cron schedules,
domains, live keys, and RLS under a real JWT.

Tick a box only after you have watched it work with your own eyes.

## Phase 0 — foundations
- [ ] Sign-up → magic link → org created → onboarding checklist appears
- [ ] Sentry receives a deliberate test error from production (`/api/debug/sentry`)
- [ ] PostHog receives a pageview from production
- [ ] `supabase db push` shows no pending migrations against prod

## Phase 1 — trainer activation
- [ ] Brand set (logo + color) shows on the branded page
- [ ] Style ingestion runs on a REAL uploaded plan and produces three profiles
- [ ] Tier builder saves prices that match what Stripe later charges
- [ ] Import maps a real CSV export from an incumbent platform
- [ ] Demo client is created and is excluded from counts everywhere

## Phase 2 — client acquisition
- [ ] Teaser page → questionnaire → preview generated with the trainer's style
- [ ] A declared allergen never appears in the preview (test with peanut)
- [ ] Invite → claim → consent → portal, on a real phone
- [ ] Rate limits hold: the same email cannot spam the funnel

## Phase 3 — adherence ledger
- [ ] Client logs a meal by text on a phone; macros are right
- [ ] Weigh-in, workout and check-in all land in the ledger
- [ ] The day-close cron writes a ledger day overnight (check the next morning)
- [ ] Forensic grid shows the week correctly

## Phase 4 — diet
- [ ] Monthly plan generates end to end for a real client
- [ ] Trainer edits and approves; the client sees the approved version only
- [ ] Macros in the PDF match the macros in the app

## Phase 5 — training
- [ ] Split generates, respects an injury exclusion, and progresses from logs
- [ ] Exercise library search works on a phone

## Phase 6 — messaging
- [ ] Client message → drafted reply in the queue within a minute
- [ ] A health-flagged message escalates and the client gets a holding line
- [ ] Push notification arrives on iOS (installed to home screen) and Android

## Phase 7 — dashboard
- [ ] Morning digest is accurate against what actually happened yesterday
- [ ] Queue, inbox, roster, analytics all load with real data
- [ ] Monthly report PDF generates for a real client

## Phase 8 — payments
- [ ] Stripe Connect onboarding completes for a real trainer account
- [ ] A real client subscribes with a real card (refund it afterwards)
- [ ] A failed payment triggers dunning; the message is system-voiced
- [ ] Payout appears in the trainer's Stripe dashboard
- [ ] `stripe-reconcile` cron runs and finds no drift

## Phase 9 — launch readiness
- [ ] Export produces a ZIP whose manifest covers every table, from production
- [ ] A deletion request schedules, shows its date, and can be cancelled
- [ ] `/admin` refuses without a hardware key, and works with one
- [ ] AI spend appears per org within a day of real usage
- [ ] Referral link → signup → attribution recorded
- [ ] Marketing site loads, sitemap and robots are correct on the real domain
- [ ] A custom domain verifies end to end on a real DNS zone
- [ ] Every runbook in `docs/runbooks/` has a rehearsal date

## Blocking, and not tickable by code
- [ ] Lawyer review complete (`docs/legal-review-checklist.md`)
- [ ] Prices confirmed and updated in `lib/marketing/pricing.ts`
- [ ] Restore drill performed against staging, date recorded
- [ ] Load test run against staging, results recorded
- [ ] Uptime monitoring alerts to a phone that will be answered
