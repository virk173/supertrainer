# Launch runbook

Not a plan for building anything. This is the sequence for putting the thing in
front of a real coach with real clients, in the order that de-risks it, plus the
decisions only you can make.

Read `docs/plan/ORIGINAL-SPEC.md` §3 (validation scorecard) and §14 (GTM) first.
The single sentence that matters from §3: *what moves this from 6.5 to 8 is one
committed anchor coach who agrees to co-build before serious code ships.* The
code shipped first. That inverts the risk, so the anchor conversation is now the
highest-value work left, not a marketing task to do afterwards.

---

## 0. Before you talk to anyone

These are blocking. Every one of them is something a coach will notice or a
lawyer will stop.

- [ ] **Prices decided.** `apps/web/lib/marketing/pricing.ts` ships placeholders.
      Every public page reads from that file; changing them is one edit. Decide
      against the dated competitor figures on `/pricing` — the incumbent stack at
      50 clients is the number to beat, and beating it by being cheaper is the
      weakest way to win.
- [ ] **Lawyer review** — `docs/legal-review-checklist.md`. Blocking the moment
      someone else's client health data is in the system.
- [ ] **Restore drill** — `docs/runbooks/database-restore.md`, rehearsed against
      staging, date recorded in the file.
- [ ] **Load test** — `load/README.md`, run against staging, results recorded.
- [ ] **Uptime alerts to a phone** — `docs/observability-slos.md`.
- [ ] **`PLATFORM_ADMIN_EMAILS` emptied** after your hardware key is registered
      (see `docs/security-review-phase-9.md`, finding 2).
- [ ] **Stripe live keys** switched, with one real card charged and refunded.
- [ ] **Beta gate walked on production** — `docs/beta-gate-checklist.md`.

---

## 1. The anchor coach

### Who
An established online coach with **100+ clients**, real income, and an audience.
Currently on Trainerize or Everfit and audibly annoyed about it. Not a new PT:
industry churn at that end is brutal and the word-of-mouth lives at the top.

Signals they're the right one:
- They already write long, personal check-ins — the thing we can learn.
- They've hit a capacity ceiling and talk about it publicly.
- They complain about add-on pricing or being unable to export their data.
- They have a method they're proud of. The product's whole premise is that their
  method is worth scaling; a coach without one gets little from it.

### The demo, which is the whole pitch
Do not demo the product. **Demo their own coaching, done by the software.**

1. Before the call, ask for 3–5 of their real plans and check-ins ("so I can show
   you something specific"). This is the Phase 1 style ingestion input.
2. On the call, run ingestion live on their material. It takes minutes.
3. Show them a drafted reply to a real client message they've handled before —
   in their voice, with the client's real numbers computed in code.
4. Then stop talking. Either they recognise themselves in it or they don't, and
   nothing else you say changes that.

If ingestion produces something bland, that is the product's honest current
state on their material — say so and ask what they'd have written instead. That
conversation is more valuable than the deal.

### Deal shapes, with bounds
| Shape | What they get | What you get | Use when |
|---|---|---|---|
| Rev-share | A share of platform revenue from coaches they refer, for a fixed term | Distribution and a public case study | They have an audience and want upside |
| Founder pricing for life | Their price frozen, permanently | A reference customer and training data | They care more about cost than upside |
| Exclusivity window | No competing coach in their niche for N months | A committed partner who promotes hard | Their niche is narrow and they fear helping rivals |

Bounds worth holding: an exclusivity window is **months, not years**, and scoped
to a named niche, never a whole market. Rev-share is on platform revenue, never
on their coaching income — the moment we take a cut of what their clients pay
them, we're their business partner and every product decision gets political.
Case-study rights should be explicit and revocable: a coach who feels trapped in
a testimonial is a coach who tells the story badly.

### Do not
- Do not promise a feature to close. The build plan is nine phases of things
  that already work; a bespoke promise made on a call becomes the reason the
  next five customers wait.
- Do not give away the export promise as a "trust us" gesture. It is already
  documented and implemented, publicly, at `/docs/data`. Point at it instead.

---

## 2. White-glove onboarding

You personally run their first month. Not support — **operation**.

1. **Import.** Their CSV, mapped with them watching, so they see nothing was
   guessed.
2. **Style ingestion on their real corpus** — more material than the demo used.
   This is the step that decides whether the product works for them.
3. **The first ten drafts, reviewed together.** Every rewrite teaches the system;
   doing the first batch beside them is both training data and training.
4. **Weekly call for four weeks.** Ask one question each time: *what did you
   rewrite this week, and why?*

**Success criterion: zero-edit rate above 60% by week four.** It is on their
analytics page and on `/admin/orgs`. Below that, the style layer is not carrying
its weight on their material — and the honest response is to fix it before
selling to anyone else, not to sell harder.

---

## 3. Beta cohort (five switchers)

From the `/switch` page and the waitlist. Five, not fifty: the point is a
feedback loop you can actually run, and five coaches with 50+ clients each is
250+ clients' worth of real load.

- Weekly feedback call, same question as above.
- **Pricing validation script:** don't ask what they'd pay. Ask what they pay
  now, itemised, add-ons included, then ask which of those they'd cancel.
  The gap between the two answers is the price.
- Watch churn signals in the product, not in the conversation: adherence-ledger
  gaps, drafts left unapproved, a trainer who stops logging in on Mondays.

---

## 4. Launch sequence

1. **Anchor case study.** Their numbers, their words, their roster growth. One
   page, dated, honest about the timeframe.
2. **Switcher campaign.** `/switch` and the `/compare/*` pages are already
   written and sourced. Offer migration concierge explicitly — the migration,
   not the software, is what keeps coaches where they are.
3. **Public.** Only after the switcher wave produces a second case study that
   isn't the anchor. Two independent stories beat one loud one.

---

## 5. Re-score, then decide

Thirty days after the anchor coach is live on real clients, re-score the §3
scorecard **with real data** and write the numbers down next to the originals:

| Dimension | Was | Now | What the evidence is |
|---|---|---|---|
| Problem severity | 8 | | Hours the anchor got back; whether their book grew |
| Willingness to pay | 8 | | What they actually pay, and what they cancelled to pay it |
| Market size | 7 | | Waitlist conversion from the switcher campaign |
| Competition | 4 | | What incumbents shipped in the meantime |
| Moat | 5 | | Zero-edit rate at week 4, and whether it climbed |
| Distribution | 7 | | Referrals the anchor produced without being asked |
| Solo-founder feasibility | 5 | | Hours/week spent on support vs building |
| Timing | 8 | | — |

**The decision gate.** If the moat line hasn't moved — if zero-edit rate is flat
and coaches rewrite everything — the product is a well-built coaching CRM with
an AI feature, competing on price with funded incumbents. That is the outcome to
name out loud rather than grind past. If it has moved, the answer is more
coaches of exactly the anchor's shape, and nothing else.
