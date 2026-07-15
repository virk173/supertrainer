# PHASE 6 — Native Messaging Platform & AI Communication Layer

**Ships:** the real-time in-app thread (client ↔ coach), push delivery + fallback ladder, the drafted-reply queue in the trainer's voice, autonomous handling of routine interactions, the hard-coded escalation gates, smart check-in cards, and transparency rules.
**Depends on:** P0 (Realtime, events), P1 (voice profile), P2 (push subscriptions, channel prefs), P3 (ledger context + reminder delivery), P4/P5 (plan context for answers).
**Feeds:** P7 (per-client inbox UI consumes threads + drafts + to-dos), P8 (payment nudges deliver here).

**This is the heaviest owned-infrastructure build (spec §13) — budget the most time here.**

---

## ① Learn first (~60 min)

| Topic | Why | Where |
|---|---|---|
| Supabase Realtime (Postgres changes vs Broadcast vs Presence) | The thread transport — know which primitive for messages vs typing vs read receipts | supabase.com/docs/guides/realtime |
| Web Push delivery lifecycle (TTL, collapse, endpoint death) | Push subscriptions die silently; your ladder depends on detecting it | web-push-libs/web-push README |
| Claude prompt caching for per-client context blocks | Every AI reply injects client context — cache the stable prefix or costs explode | claude-api skill |
| Moderation/safety patterns for user-generated content | Clients will send anything; drafts must never echo abuse | 20-min read |

## ② Claude setup for this phase

- Skills: `claude-api` FIRST (context assembly + caching architecture), `feature-dev`, `frontend-design` (thread + queue UX), `superpowers:systematic-debugging` (realtime bugs are heisenbugs — use the process).
- **Uninterruptable config:** ralph-loop the reply-quality tuning with promise "reply eval: 50-case fixture set ≥90% correct routing (autonomous vs draft vs escalate — same gate as the 6.3 CI threshold), 0 escalation false-negatives". Escalation gate files get the same PreToolUse test-guard as allergens.
- Worktree `phase-6`.

## ③ GitHub repos for this phase

- [shwosner/realtime-chat-supabase-react](https://github.com/shwosner/realtime-chat-supabase-react) — Supabase Realtime chat reference — our transport, zero new infra
- [web-push-libs/web-push](https://github.com/web-push-libs/web-push) — VAPID push (MPL-2.0)
- [novuhq/novu](https://github.com/novuhq/novu) — notification workflow/digest patterns (reference; we own delivery via P3 queue)
- [centrifugal/centrifugo](https://github.com/centrifugal/centrifugo) — escape hatch if Supabase Realtime hits scale limits (document the trigger: >5k concurrent connections)
- [anthropics/claude-agent-sdk-typescript](https://github.com/anthropics/claude-agent-sdk-typescript) — reply agents

## ④ Pipeline map

```
client message → messages table → Realtime fanout → trainer inbox (P7)
      ▼
[intent classifier — Haiku + rules, fail-closed]
  ├─ ESCALATION (injury/pain/medical/plan-change/distress) → NEVER autonomous → urgent queue item,
  │    holding line sent as clearly-automated ("Flagging this for Coach {name} — he'll reply personally")
  ├─ ROUTINE-AUTONOMOUS (log confirmations, reminder acks, factual plan lookups: "what's my lunch?")
  │    → answered instantly, styled as system/assistant, visually distinct from coach messages
  ├─ CONVERSATIONAL → drafted-reply queue: full-context draft in trainer voice → trainer approves/
  │    tweaks/rewrites (edit captured → voice learning) → sends as coach
  └─ QUESTION-WITH-PLAN-IMPACT ("can I eat out tonight?") → draft computes REAL numbers in code
       (remaining macros from P3 logs vs P4 targets) → drafted reply, trainer one-tap
outbound (reminders P3, plan notifications P4/P5, digests) → notifications queue → push ladder:
push → 4h unread → badge/in-app → 8pm local → email digest line (Resend)
smart check-in cards: AI picks from card bank based on data gaps → tap-answers write to ledger
```

## ⑤ Sub-phases — copy-paste prompts

### 6.1 — Thread infrastructure

```
Read CLAUDE.md and docs/plan/PHASE-6-messaging-ai-layer.md §④. Study shwosner/realtime-chat-supabase-react for the Realtime patterns, then build our own in apps/web:

- EXTEND the stub messages table from P2.5 (interview turns + P3.6 reminder mirrors already live there — migrate in place, don't recreate): promote kind to enum text|voice|photo|card|plan_delivery|log_confirmation|reminder|interview, add reply_to nullable, read_at, delivered_at; verify RLS (client sees own thread; org staff see org threads)
- Realtime: Postgres changes subscription per thread (client portal) + org-wide (trainer inbox); Presence for typing indicator; read receipts via read_at batch updates
- Client thread UI (/portal/chat — but it IS the home tab): message list (virtualized), composer (text, photo attach → P3 meal path when food detected — offer "log this?", voice note record → P3 voice path), structured cards render inline (check-in cards, meal confirms, plan deliveries with PDF preview)
- Coach/system/assistant visual distinction (transparency rule ORIGINAL-SPEC §8): assistant messages get subtle "AI assistant" label + distinct avatar treatment; coach messages get trainer avatar. NEVER blur this line — snapshot-test the rendering
- Message retention: full history, paginated fetch, search (Postgres FTS)
- Offline: outbound queue in IndexedDB (reuse P3 pattern), optimistic render, dedupe on sync

Playwright two-context test: client sends → trainer receives realtime; typing indicators; offline send-on-reconnect. Commit: "feat(chat): realtime thread on Supabase".
```

### 6.2 — Push delivery + fallback ladder

```
Build the delivery layer (P3's notifications queue gets its transport):
- Web push sender (web-push lib, VAPID keys in env): worker consumes pgmq queue → per subscription attempt → prune dead endpoints (410) + mark client push-degraded when all endpoints dead → auto-enroll in email fallback + portal banner "re-enable notifications"
- Ladder implementation (CODE, tested): send push → if message unread after 4h → in-app badge escalation (portal badge count) → if still unread by 20:00 local → include in daily email digest (Resend template: unread count + first lines + deep link; NEVER full message content — privacy)
- Service worker: push event → notification display (trainer brand icon, personal-feeling copy from P3 templates) → click → deep link to thread/log surface; notification actions where supported ("Log meal" direct action)
- Delivery telemetry: notifications.status transitions logged; per-org delivery health visible later (P7 settings): push success rate, dead-endpoint count
- Quiet hours respected at the LADDER level too (badge yes, push no during quiet hours)

Fixtures: ladder timing, dead endpoint pruning, quiet-hours interaction with ladder. Commit: "feat(push): delivery ladder with degradation handling".
```

### 6.3 — Intent classifier + escalation gates (fail-closed)

```
This is a safety component. TDD with the fixture set FIRST; load claude-api skill.

Build packages/ai/comms-router (this ABSORBS packages/ai/escalation.ts from P2.5 — move its logic in, leave escalation.ts re-exporting from comms-router so P2.5 call sites keep working):
- Two-gate escalation (MASTER-PLAN G9): Gate 1 = deterministic keyword/pattern list (pain, hurt, injury, dizzy, chest, pregnant, medication, doctor, ED-signal terms, self-harm signals — multilingual incl. Hinglish terms); Gate 2 = Haiku classifier (Zod: {category, confidence}); EITHER gate firing = escalation. Confidence < 0.8 on ANY category = treat as conversational (draft, human sees it) — never autonomous on uncertainty
- Categories → routing per §④ map: escalation | routine_autonomous | conversational | plan_impact
- Escalation handling: urgent queue item (P7), holding line sent as SYSTEM message (clearly automated, no AI pretending care), trainer push notification immediately (their own notification prefs), self-harm category additionally surfaces crisis-resources card to client (copy reviewed carefully — supportive, non-clinical)
- Plan-change requests ("switch me to 3 days") = escalation category per spec — trainer decides, AI drafts the options analysis for the trainer privately
- 50-case fixture suite: obvious escalations, sneaky ones ("legs felt weird after squats"), false-positive bait ("my wallet hurts after buying supplements", "this workout is killing me" as slang), Hinglish cases, routine, plan-impact. Target: 100% escalation recall (zero false negatives — false positives are acceptable), ≥90% overall routing accuracy. CI-gated.

Commit: "feat(router): fail-closed intent classification and escalation gates".
```

### 6.4 — Drafted-reply queue + autonomous replies

```
Build the reply engine (packages/ai/reply-engine + queue surfaces):
- Context assembler (CODE): per-client context block — profile summary, active plan targets + today's day type + fast window, today's ledger (logged/remaining macros computed in code), adherence score, current split day, last 20 messages, open to-dos. Stable prefix structured for prompt caching (claude-api skill patterns); assembled context ≤ 4k tokens with summarization fallback for long histories (nightly client-summary batch job)
- Autonomous lane (routine_autonomous only): factual answers computed in CODE first (remaining macros, next session, weigh-in day), Haiku wraps numbers in friendly copy — numbers NEVER from the model; sent as assistant-labeled message instantly
- Draft lane (conversational + plan_impact): Sonnet drafts in trainer voice (voice profile + exemplar bank from P1, top-5 similar past replies via pgvector retrieval on style_exemplars — embeddings are generated by the P4.3 nightly job; verify it's running and backfill any null-embedding rows before enabling retrieval) → drafts (id, org_id, client_id, message_id trigger, draft_text, context_snapshot, status enum pending|approved|edited|rewritten|dismissed, created_at, actioned_at)
- Queue surface (minimal here; P7 builds the full inbox): /trainer/queue list → draft card (client context header, triggering message, draft, [Approve & Send] [Edit] [Rewrite] [Dismiss]) — approve = one tap, edit inline; every action captured (draft_edits with entity_type='reply' — voice learning: edited/rewritten diffs → style_exemplars nightly via the P4.3 job)
- SLA nudge: drafts pending > trainer-set threshold (default 4h waking hours) → trainer push
- Voice quality eval: 20 fixture conversations × trainer personas → blind-score draft naturalness vs voice profile (Langfuse eval, LLM-judge + your manual review); zero-edit rate tracked per draft type

Commit: "feat(replies): drafted-reply queue + autonomous lane with coded numbers".
```

### 6.5 — Smart check-in cards + weekly digest

```
Build the structured-interaction layer:
- Card bank (versioned templates): sleep quality, stress, soreness, energy, motivation, weekend plan, travel week, questionnaire fallback (P5 non-loggers), custom (trainer-authored: question + answer type)
- Card picker (nightly batch): per client, data-gap analysis in CODE (no sleep data 5 days, adherence dropped, deload week) → candidate cards ranked → max 1 card/day, 3/week, never during quiet hours → delivered as thread card; tap-answers write to ledger (check_in_responses table) + surface in trainer lens
- Client weekly recap (Sunday evening local): score, streak, highlights, next week preview — generated via Batch API in trainer voice, assistant-labeled, with 1 coach-approval-optional insight line (org setting: auto-send vs draft-first)
- Trainer morning digest (the spec §13 core loop): 7am local push + in-app card — who's on track/slipping (P3 patterns), pending drafts count, renewals due (P4), escalations overnight; deep links into P7 queue views

Fixtures: card frequency caps, gap-analysis picks, digest content assembly. Commit: "feat(cards): smart check-ins + weekly digest".
Update PROGRESS.md: Phase 6 complete.
```

## ⑥ Definition of done → handoff

- [ ] Realtime thread solid under 2-context Playwright + reconnect chaos test (kill connection mid-send ×20 — zero lost/duped messages)
- [ ] Push ladder verified end-to-end on Chrome desktop + Android + iOS standalone PWA; degraded clients auto-fallback
- [ ] Escalation: 100% recall on fixture suite, CI-gated; assistant/coach visual distinction snapshot-tested
- [ ] Autonomous numbers provably code-computed (lint rule extended); drafts approve in one tap; edits feed voice learning
- [ ] Morning digest assembles correctly against demo-client data; check-in card caps hold; demo seeder stage seedThread implemented (thread history, one escalation, one pending draft)
- **Handoff to Phase 7:** threads, drafts, escalations, digests, to-dos all exist as DATA — Phase 7 builds the daily-driver dashboard UI on top of them.
