# AI Coaching Platform for Personal Trainers — Product Specification

**Working title:** TBD
**Version:** 1.0 (compiled July 15, 2026)
**Status:** Pre-build specification

---

## 1. Executive Summary

A SaaS platform for online fitness coaches, personal trainers, and fitness influencers that lets one coach serve 3–5x more clients without hiring, by pairing an AI layer trained on *that specific coach's* voice and methodology with a forensic client-adherence system.

**Our customer:** the coach. **Their customer:** the client. The product manages the coach's entire client operation — tracking, plan generation, communication, and payments — replacing spreadsheets and generic coaching platforms.

**Core thesis:** The real scaling constraint in online coaching is not software — it is the coach's attention. Incumbents (Trainerize, Everfit, TrueCoach, PT Distinction) sell generic tooling with AI bolted on. Nobody has productized "an AI that coaches like *you*." That is the wedge.

---

## 2. Positioning & Differentiation

As of mid-2026, AI workout builders and photo meal scanning are **table stakes** — Trainerize, Everfit (MacroSnap), PT Distinction, and others all ship them. Generic generation is no longer a differentiator.

Differentiation rests on three pillars nobody currently offers:

1. **Style-Learning Layer** — every AI draft (diet plans, training splits, replies) is generated in the individual trainer's methodology, learned from their past plans and refined by every edit they make. Drafts converge toward zero-edit over time. This is also the switching cost: after six months the AI knows their system.
2. **Trainer-Voice Drafted-Reply Queue** — AI drafts every client-facing conversational message in the trainer's voice with full client context; the trainer approves, tweaks, or rewrites in one tap. Daily "personal" contact at collapsed marginal cost, with zero deception (the trainer reads and approves everything).
3. **Adherence Forensics (the Dispute-Ender)** — silence becomes data. Every missed log is recorded, producing an evidence trail that ends the "I followed everything and nothing worked" conversation and protects the trainer's reputation.

**Secondary competitive attacks (from July 2026 market scan):**

- **All-inclusive pricing.** Incumbents are widely resented for add-on stacking (nutrition $33–45/mo extra, AI check-ins $30/mo, automation $24/mo, payments $8/mo — real cost ~2x headline price). We charge one price, everything included, tiered only by client count.
- **One-click full data export.** Incumbents trap coaches via non-exportable client history. "Your data is always yours" is a stated trust promise and converts frustrated switchers — our most likely first customers.

---

## 3. Validation Scorecard (honest, pre-build)

| Dimension | Score | Notes |
|---|---|---|
| Problem severity | 8/10 | Check-in fatigue and roster caps are real, daily, income-limiting |
| Willingness to pay | 8/10 | Coaches charging $150–400/client/mo already pay $50–130/mo for tools |
| Market size | 7/10 | Large and growing; true ICP (50+ client coaches) is a subset |
| Competition | 4/10 | Funded incumbents actively shipping AI; weakest leg |
| Moat | 5/10 | Style-learning + data compounds over time, but doesn't exist day one |
| Distribution | 7/10 | No marketplace, but each coach onboards 30–150 clients; influencer showcase effect |
| Solo-founder feasibility | 5/10 | Heavy build: messaging infra, AI quality control, health-adjacent liability |
| Timing | 8/10 | AI capability is ready; coaches curious not hostile; window closing |
| **Overall** | **6.5/10** | |

**What moves it to 8:** one committed anchor coach (ideally an influencer with 100+ clients) agreeing to co-build and rev-share *before serious code*. Fixes distribution, validates pricing, and supplies the style-learning training data.

---

## 4. Market Scan Findings (July 2026)

**Incumbent landscape:**

- Trainerize (ABC): AI Workout Builder on client profiles, conversational refinement; trainers report ~50% faster programming. 400k+ trainers. Add-on-heavy pricing.
- Everfit: AI programming from text notes, MacroSnap photo meal scanning, wearable integrations (Apple Health, Google Fit, Fitbit, Garmin, Oura), white-label apps. Add-on pricing resented.
- PT Distinction: AI assistant, photo food diary, deep customization.
- MyPTHub: Check-Ins AI at $30/mo extra — validates willingness to pay for AI check-in tooling specifically.
- TrueCoach: clean programming focus; flat 5% cut on all client payments.
- 64% of trainers already use AI regularly (2026 industry report) — market is educated, not skeptical.

**Coach pain points with incumbents:** add-on price stacking, data lock-in (non-exportable client history), per-client pricing punishing growth.

**Photo food logging accuracy (why we require a confirm step):** real-world food identification runs ~68–86%; portion estimation as low as 39%; error 15–20% on simple foods, 30–50% on complex/homemade meals. Raw photo estimates would corrupt the adherence ledger and monthly plan adjustments. Research consensus: logging *consistency* matters more than precision for outcomes — which validates the entire Feature 1 design philosophy.

---

## 5. Feature 1 — Adherence Ledger

Daily tracking + accountability record. Not really a tracking feature — a **dispute-ender** and the data engine feeding every other feature.

### Client-side logging (10-second rule applies to everything)
- **Diet logging via text** — client texts what they ate ("2 rotis, dal, salad"); AI parses to calories/macros against their plan. Conversational, never a form.
- **Photo meal logging** — client snaps the plate → AI proposes items + portions → client confirms/tweaks in one tap → **final numbers always come from the verified food database, never raw from the image model.** Photo is stored in the ledger: the trainer sees actual plates at review time, and photos are harder to fake than text.
- **Weigh-ins 3x/week** — prompted on set days; client replies with a number.
- **End-of-day gym check-in** — one tap (trained / rest day). On lifting days, logged working sets count as the check-in automatically.
- **Working set logging (client portal)** — weight × reps per set against each exercise, pre-filled from today's scheduled day.
- **Automated reminders** — nudges to log meals, weigh in, check in.

### System behavior
- **Auto-marked misses** — anything not logged by end of day is recorded as *missed*, not blank. Silence becomes data.
- **Weekly adherence score per client** — rolled up from raw logs; trainers scan a number, not rows.
- **Everything writes to the trainer's CRM** under the client's ID.
- **Wearable sync** — Apple Health / Google Fit first (Fitbit/Garmin/Oura later). Steps, sleep, activity feed the adherence picture and the monthly TDEE/plan adjustments.
- **Progress photos** — weekly or monthly front/side/back uploads via portal, surfaced at monthly review alongside weight trend and adherence score.

### Two-lens scoring (decision: score IS shown to clients)
- **Client lens:** weekly score with supportive framing, streaks, explicit recovery mechanics ("3-day comeback"), never red shame walls.
- **Trainer lens:** full forensic ledger — every miss, patterns by day, multi-month trends, working-set compliance.
- Rationale: hiding the score removes the accountability effect without preventing lying, and turns hard conversations into surveillance ambushes. Shared visibility means the client always knows where they stand.

### Design rules
- Every prompt answerable with one text or one tap. Every extra step kills compliance — the entire feature dies if logging takes more than 10 seconds.
- The ledger must understand protocol context (e.g., Tuesday was a low-carb day; fast window ended at 8pm).

---

## 6. Feature 2 — Diet Plan Generator

Intake → multi-agent AI draft → trainer approval. Drafts in the *trainer's* methodology, not generic AI meal plans (clients can get those free — the style layer is the entire value).

### Client intake
Height, weight, age, activity level (job type), training availability/week, dietary preference (veg / non-veg / vegan), allergies, preferred ingredients, current supplement stack. Delivered as a conversational onboarding flow; stored on the client profile.

### Agent pipeline
1. **Style-learning agent** — ingests the trainer's past plans; learns meal structure, food rotation, carb timing, cuisine patterns, supplement placement. Runs at onboarding and keeps learning from every trainer edit.
2. **Research agent** — evidence-based approach for this client's profile.
3. **Calculation agent** — TDEE, calorie target, macro split, portioning. **Coded math against a verified nutrition database — the LLM never does arithmetic.** LLM chooses foods and structure; code does numbers.
4. **Recipe agent** — combines the approved ingredient pool into tasty meals; generates **2 plan versions** per client (choice increases adherence; people log meals they enjoy).
5. **Review agent** — final sanity check against all constraints.
6. **Trainer approval** — nothing reaches a client unapproved.

### Protocol modules (trainer-activated)
- **Fasting support** — if the trainer prescribes IF or similar: plans structured around the eating window; client gets a fasting counter (window countdown, fast start/end check-ins feeding the ledger).
- **Carb cycling** — trainer sets high/medium/low-carb day patterns (e.g., training vs. rest days); calculation + recipe agents generate per-day-type targets and meals.
- Both belong to the style-learning layer: if a trainer's history shows they run 16:8 or carb cycles, drafts propose it automatically.

### Hard build rules
1. **Allergies are constraints, not suggestions.** Declared allergens are hard-blocked by a deterministic filter at the food-database level before any agent selects foods. Never left to the LLM. One allergic reaction from an AI plan is an extinction-level event for the product.
2. **Plans are versioned.** Month 2's draft references month 1's plan + the adherence ledger + wearable activity data, enabling intelligent monthly adjustment.

### Legal structure (see also §12)
- **One-time signed informed-consent agreement at client onboarding** (lawyer-drafted, e-signed during intake, stored on profile): not medical advice, consult a physician, disclose all allergies/conditions accurately, results vary.
- **No liability-waiver line on plan PDFs.** A "user is responsible for allergic reactions" line is near-worthless where the client disclosed the allergy (negligence isn't waivable in Canada/US) and damages trust. PDFs may carry a neutral footer: "prepared based on the dietary information you provided."
- Real protection = the engineering layer (deterministic allergen block), which prevents the incident rather than arguing about it afterward.

---

## 7. Feature 3 — Split Designer

### Client intake
Job type, training days available, experience level, **injury history** (changes exercise selection more than anything else).

### Agent pipeline
1. **Style-learning agent** — trainer's past splits: exercise selection, volume patterns, rep schemes, periodization habits (load progressors vs. volume progressors vs. exercise rotators — the progression agent follows *their* pattern).
2. **Research agent** — evidence-based programming for this profile from reputable sources.
3. **Review agent** — 3–4 fresh-eyes review loops.
4. **Draft to trainer** for approval.

### Delivery & progression
- Approved split publishes to the client portal: exercises, sets, reps, tips and techniques.
- **Monthly progression drafts** — informed by logged working sets (actual top sets, rep trends), not blind "+5 lbs everywhere." Trainer-approved before shipping.
- If a client isn't logging sets, fallback: monthly check-in questionnaire ("which lifts felt easy/hard?") feeds the draft.

### Exercise video library
- Per exercise: trainer uploads their own demo with cues, or pastes a YouTube link to another creator's video as fallback.
- Build note: an uploaded library of 80+ filmed demos is a major switching cost — nudge trainers to upload over time.

---

## 8. Feature 4 — AI Communication Layer & Custom Tiers

### AI layer (the floor — on EVERY tier, including the cheapest)
- Full per-client context: current plan, today's logs, adherence history, split, fasting window, day type, recent messages.
- Handles autonomously: reminders, meal logging confirmations, routine Q&A ("can I eat out tonight?" answered against *their* remaining macros for *their* day type, in the trainer's voice and methodology).
- **Drafted-reply queue:** anything conversational or plan-affecting is drafted in the trainer's voice; trainer approves/tweaks/rewrites in one tap. Ten platinum clients = a 10-minute morning ritual, not an hour of typing.
- Rationale for AI-on-every-tier: the data engine requires daily interaction from every client; a monthly-contact basic tier kills the ledger.

### Escalation rule (hard-coded)
Anything touching injury, pain, medical conditions, or plan changes is **never answered autonomously** — always routes to the trainer.

### Transparency rule
Clearly automated messages (reminders, logging confirmations) may be obviously systematic. Anything conversational is drafted-and-approved at minimum. A fully autonomous AI impersonating the trainer in personal check-ins is where trust dies — framed always as *assistant coach*, never replacement.

### Native messaging platform (decision: no SMS/WhatsApp/email channels)
All communication happens inside the app — a deliberate simplification that eliminates per-trainer number provisioning, WhatsApp Business verification, carrier compliance (A2P), per-message fees, and email deliverability management.

- **Client side:** one thread with their coach. Reminders, check-ins, AI replies, and plan PDFs all arrive in-app via push notifications. Rich interactions SMS can't do (tap-to-log, structured check-in cards).
- **Trainer side — per-client inboxes:** each client has a dedicated inbox combining (1) the conversation thread, (2) drafted AI replies awaiting one-tap approval, and (3) a per-client to-do tracker (plan renewal due, drafts pending, missed weigh-ins, adherence flags, failed payment). This merges the Review Queue into a client-centric view; a global queue aggregates all pending items across clients.
- **Push-compliance mitigations** (adherence engine depends on prompts landing): notification permission is a framed onboarding step ("this is how your coach reaches you"); personal-feeling notifications ("Coach Sam reviewed your meal") over system-feeling ones; thin email fallback as safety net only — unread-message digests, payment receipts, PDF copies. Email is not a communication channel.
- **PDFs** (plans, consent copies) deliver in-app with email copy as backup.

### Trainer-defined tiers
- Trainers create their own tiers: names, count (3, 4, 5...), prices, and contents (personal check-in frequency, video calls, response priority, etc.). Their brand, their packaging.
- The AI floor is the one constant. Human attention is what the tiers sell:
  - Example ladder: Basic = AI daily + monthly plan review · Silver = + personal check-in every 2 weeks · Gold = + weekly · Platinum = + daily personal replies (via drafted-reply queue), priority access, monthly video call.

---

## 9. Feature 5 — Payments & Subscriptions

- **Tier-based recurring billing** — each Feature 4 tier is a subscription; trainer sets price per tier, currency, cadence (monthly minimum).
- **Client flow** — pick/assigned tier, card on file, auto-renew; upgrades/downgrades prorate.
- **Failed payments** — auto-retry → flag in trainer review queue → optional pause of AI layer/portal until resolved. The trainer never personally chases money ("the system paused your plan" beats "you owe me").
- **Rails: Stripe Connect** — each trainer is a connected account; client → platform → trainer payout; Stripe handles KYC, tax forms, cross-border.
- **Platform revenue model (leaning, not final):** hybrid — modest base SaaS fee + small percentage (2–3% on top of Stripe's cut). Pure percentage taxes big trainers; pure flat fee doesn't share in their growth. Note: TrueCoach's 5% is resented — stay well under it.
- Strategic note: this feature turns the product into the trainer's **business rails** (roster + plans + communication + income). Deepest switching cost in the spec.

---

## 10. Cross-Feature Systems

### Client Onboarding & Teaser Funnel
A two-stage intake that doubles as a lead-conversion tool trainers can share (link-in-bio, socials).

**Stage A — Teaser minimum (8–10 questions, <2 min, pre-payment):** name, email/phone, age, sex, height, weight, primary goal, activity level (job type), training days/week, experience level, dietary preference (veg/non-veg/vegan), **allergies** (required in Stage A — previews must never show allergen foods).

**Teaser mechanic:** system generates a partial diet plan (top 2 lines visible) and partial split (top 4 exercises visible); remainder **blurred**, not truncated ("your full plan already exists" effect). CTA: choose a tier → unlock full plan.
- Preview is explicitly labeled "draft preview — your coach will review and finalize." The full plan still passes the trainer approval gate after signup; the teaser does not bypass it.
- Allergen hard-block applies to previews. No exceptions.
- Per-lead generation cost is small but nonzero — rate-limit teaser generations per trainer link.

**Stage B — Full onboarding (post-signup, conversational, spread over first days):**
- *Logistics:* preferred messaging channel, timezone (reminder scheduling depends on it), preferred language.
- *Goal detail:* target weight, deadline/event, past diet attempts.
- *Nutrition depth:* intolerances, food dislikes, preferred ingredients/cuisine, meals/day preference, cooking time & skill, eating-out frequency, alcohol/caffeine habits, current supplement stack.
- *Training depth:* session length, equipment access, injury history, exercise likes/dislikes, current program.
- *Lifestyle:* sleep hours, daily steps, stress, shift-work schedule.
- *Health flags:* medical conditions, medications, pregnancy/nursing — any flag routes to the trainer before plan finalization.
- *Admin:* informed-consent e-signature, wearable connect, tier/payment (captured at teaser unlock).

### Trainer Review Queue & Per-Client Inboxes (the trainer's daily-driver screen)
- **Per-client inbox** (see §8): conversation thread + drafted AI replies + per-client to-do tracker in one view.
- **Global queue** aggregates across all clients: pending drafts (diet plans, splits, progressions, replies) awaiting approval.
- Monthly renewal reminders: "Client X completes month 1 Friday — diet and split drafts ready for review."
- Clients slipping on adherence.
- Failed-payment flags.
- This queue is the product's daily habit loop for the paying customer.

### Client Portal
- Current split with videos, sets/reps, tips.
- Current calories/macros/plan; fasting counter and day-type where active.
- Working-set logging; tracking prompt history; progress photo uploads.
- Their adherence score (client lens).

### Two-lens scoring — see §5.

### Consent & onboarding — see §6 and §12.

---

## 11. Business Rules

1. **All-inclusive pricing** — every feature in every plan; pricing tiers by client count only. Direct attack on incumbent add-on stacking.
2. **One-click full data export** — client profiles, plans, check-in history, photos, notes. Stated publicly as a trust promise.
3. **Two-layer branding** — our brand faces the trainer (B2B); the trainer's brand faces their clients (B2C). The platform is invisible rails to the end client, reinforcing the AI-twin positioning.
   - **v1 (included in all plans):** branded client experience — trainer's name, logo, and colors on the client portal; custom link (coachname.platform.com or own domain); all messages, emails, and plan PDFs carry the trainer's brand; trainer's social media links displayed at the bottom of the client portal, emails, and plan PDFs. Included rather than an add-on to preserve the all-inclusive pricing promise.
   - **v2 (premium tier, parked):** full white-label native mobile app (trainer's own App Store / Play Store icon). Real per-trainer costs (builds, store accounts, review cycles) justify it living outside the all-inclusive promise as a distinct tier — incumbents charge $145–225+/mo for this.

---

## 12. Legal & Safety Summary

- One-time lawyer-drafted informed consent at client onboarding (e-signed, stored).
- Deterministic allergen hard-block at the database layer — non-negotiable.
- No LLM arithmetic anywhere numbers matter — coded math + verified nutrition database.
- Hard escalation to trainer for injury/pain/medical/plan-change topics.
- Trainer approval gate on all plans and all conversational messages.
- No fake liability-waiver lines on deliverables.

---

## 13. MVP Scoping Recommendation

**Cut from v1:** full CRM (integrate lightly, let coaches keep current tools initially), payments (Stripe payment links interim), white-label.

**The single loop that IS the product:**
1. Coach uploads past plans + check-in style → style-learning ingestion.
2. AI runs daily check-ins + meal logging in their voice via the native in-app thread.
3. Coach gets a morning digest: who's on track, who's slipping, drafted replies to approve.

Quality bar note: bad AI replies are visible failures in front of the coach's paying clients — the reply-drafting quality bar is high from day one. The native messaging platform (real-time thread, push notifications, per-client inboxes) is now the heaviest build component — but it is owned infrastructure rather than third-party channel compliance, trading external fragility for internal build effort.

---

## 14. Go-to-Market

- **Anchor coach first.** One influencer coach (100+ clients) on a co-build/rev-share deal before serious code. Supplies training data, validates pricing, becomes the case study.
- **Built-in distribution dynamic:** every coach onboards 30–150 clients; influencer coaches publicly demoing "my AI twin answers you in minutes" is unpurchasable marketing.
- **Second wave:** switchers frustrated by incumbent add-on pricing and data lock-in — targeted directly by the §11 business rules.
- **ICP discipline:** established online coaches with 50+ clients and real income. Avoid brand-new PTs (industry churn is brutal; retention and word-of-mouth live at the top).

---

## 15. Risks & Open Decisions

### Risks
1. **Trust/liability** — one off-brand AI reply in the coach's name damages a years-old relationship; mitigated by human-in-the-loop + escalation rules.
2. **Incumbent response** — funded platforms are shipping AI monthly; the bet is depth-in-voice beats bolted-on features. Speed matters.
3. **Client-count economics** — costs scale with clients-of-clients; pricing must too (client-count tiers + payment percentage).
4. **Coach churn** — mitigated by ICP discipline (established coaches).
5. **Solo-founder load** — heaviest build yet contemplated alongside a day job and Covered; MVP scoping (§13) is the mitigation.

### Open decisions
- Product name and domain.
- Final revenue split (base fee vs. percentage mix).
- ~~Messaging channel priority~~ — **resolved: native in-app messaging platform** (see §8); no SMS/WhatsApp/email channels.
- v1 wearable scope (Apple Health + Google Fit confirmed; Fitbit/Garmin/Oura timing).
- Anchor-coach deal structure (rev-share % , exclusivity window).

---

*Compiled from product development sessions, July 2026. Validation scorecard reflects pre-build assessment; re-score after anchor-coach conversations.*
