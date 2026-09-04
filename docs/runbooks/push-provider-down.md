# Push / notifications not arriving

Symptoms: reminders and check-in cards aren't reaching clients; `notifications`
rows sit in `failed`, or clients report silence.

## Triage

1. `/admin/orgs` → the **Push** column is delivery success over the last 30 days,
   per org. A platform-wide problem shows up in every row at once; one org at
   0% is usually that trainer's clients, not us.
2. Check `notifications` for the failure reason on recent rows — an expired
   subscription (410/404 from the push service) is a client-side fact, not an
   outage.

## If it is the provider (Web Push endpoints erroring)

1. Email remains the fallback path and does not depend on Web Push. Confirm the
   digest emails are going out (Resend dashboard) — clients still hear from their
   coach.
2. Publish an incident on the **portal** surface: clients should know their
   reminders are late rather than assume their coach went quiet.
3. Do NOT mass re-send once it recovers. The reminder tick is deduplicated per
   client per day per slot; a manual flood would arrive as duplicates and read
   as broken.

## If it is VAPID keys

A rotated or mismatched `VAPID_PRIVATE_KEY`/`NEXT_PUBLIC_VAPID_PUBLIC_KEY` pair
invalidates **every existing subscription** — the browser encrypted them to the
old public key. Recovery is: restore the old pair if you have it; otherwise
clients must re-enable notifications, and the portal's degraded-push banner
prompts exactly that. Treat the keypair as a credential you cannot re-issue
casually.

## Expected, not an incident

- A client who cleared site data or reinstalled their browser loses the
  subscription. The `push_degraded_at` flag surfaces the banner that asks them to
  turn it back on.
- iOS requires the portal to be installed to the home screen before it can
  receive push at all. That is Apple's rule, and the install walkthrough covers it.
