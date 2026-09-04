# Claude unavailable, rate-limited, or out of credit

Symptoms: drafts stop appearing in the queue; plan generation requests stay
`queued`; meal parsing returns nothing.

## What already happens without you

- **Retries and fallback.** `packages/ai/resilience.ts` retries with backoff and
  falls back a model tier before giving up, and a circuit breaker stops hammering
  a provider that is down.
- **Nothing is silently wrong.** A failed plan request stays `queued` rather than
  producing a half-plan; a failed draft means the trainer answers the message
  themselves, which is the pre-AI baseline, not an outage for the client.
- **Escalations do not depend on the model.** The keyword health gate runs in
  code first, so a medical message still reaches the trainer with Claude down.

## Act

1. Check the balance before the status page — an exhausted credit balance
   presents as a 400, not an outage, and it is the most common cause.
2. `/admin` → **AI spend** and the per-org budget meters: a runaway org can
   exhaust a shared quota. Throttling that org (scheduled AI stands down; replies
   and parsing keep running) buys room without breaking anyone's coaching.
3. If it is a real provider outage: publish an incident on the **dashboard**
   surface only. Trainers need to know their queue is empty because drafting is
   down; clients do not need to hear about our vendors.

## Do not

- Do not disable the Zod validation to "get something through". Unvalidated model
  output reaching a plan is worse than no plan.
- Do not raise every org's budget cap to clear a backlog. The caps are the thing
  that stops one bad month from costing more than the product earns.
