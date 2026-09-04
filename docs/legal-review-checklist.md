# Legal review checklist

**Status: BLOCKING for launch with real clients.** Not for a friendly-trainer
pilot on your own data; blocking the moment someone else's client health
information is in the system.

This is what to put in front of a lawyer, and what to ask them. It is written so
that a review can be scoped and quoted without them reading the codebase.

## What to send

| Document | Where it is | State |
|---|---|---|
| Client informed consent | `apps/web/lib/consent/template.ts` (versioned, e-signed, hash + timestamp + IP stored in `consents`) | Drafted in-house |
| Terms of service | `/legal/terms` | Draft, published with a visible "pending legal review" banner |
| Privacy notice | `/legal/privacy` | Draft, same banner |
| AI disclosure (client-facing) | The consent flow + `/security` | Drafted in-house |
| Data export & deletion policy | `/docs/data` | Implemented and tested; the doc describes real behaviour |
| Sub-processor list | `/legal/privacy` | Current as of the last edit — re-check before signing |

## What to ask

### Consent and the coaching relationship
1. Does the consent text hold in the jurisdictions we're launching in (Canada
   first: PIPEDA and provincial equivalents; then US states with comprehensive
   privacy statutes)?
2. Is a **coach** the controller and **we** the processor, in the way the terms
   describe? Do we need a separate DPA between us and each coach, and should it
   be click-wrapped at onboarding?
3. The consent is versioned and re-prompted when the text changes. Is
   re-consent-on-change sufficient, or must material changes be affirmatively
   re-signed with notice?

### The AI, specifically
4. Clients are told an AI drafts messages their coach approves. Is that
   disclosure sufficient under the emerging AI-transparency rules, and does it
   need to be in the consent document rather than only in the interface?
5. We escalate medical, injury and mental-health topics to a human and never
   answer them. Does that keep us clear of practising a regulated profession?
6. Nutrition plans are generated from a verified food database with allergens
   hard-blocked in code. What disclaimer, if any, must accompany a plan PDF —
   and does adding one weaken the coach's own professional position? (The spec
   explicitly forbids fake liability-waiver lines; we want a real one or none.)

### Data
7. Thirty-day deletion delay, with an anonymised tombstone retained. Is the
   tombstone defensible under a deletion request, and is thirty days acceptable
   or does it need to be shorter on request?
8. Health data (allergies, conditions, injuries) is sensitive-category data. Are
   our storage, access and export controls sufficient, and do we need explicit
   separate consent for it?
9. Model inference sends coaching content to Anthropic. Confirm the required
   sub-processor disclosure and whether client consent must name them.

### Money
10. Coaches are paid through Stripe Connect under their own connected accounts;
    we are not merchant of record for coaching fees. Confirm the terms say that
    correctly, and that our platform fee is described accurately for tax.
11. Dunning messages are system-voiced and never impersonate the coach. Any
    consumer-protection constraints on automated payment chasing?

## Before the banner comes off

- [ ] Lawyer has reviewed and returned edits for all four documents
- [ ] Edits applied; `updated` dates bumped in `/legal/*`
- [ ] `robots: noindex` removed from the legal pages (`app/(marketing)/legal/*`)
- [ ] The draft banner removed from `components/marketing/legal.tsx`
- [ ] Consent version bumped in `lib/consent/template.ts` if the client-facing
      text changed — existing clients are then re-prompted automatically
