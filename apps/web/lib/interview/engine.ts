import "server-only";

import {
  detectHealthFlags,
  generateClientBrief,
  interviewTurn,
  isInterviewComplete,
  nextSection,
  serializeConfirmedStyles,
  type HealthFlagResult,
  type InterviewSection,
  type SectionAnswers,
} from "@supertrainer/ai";
import type { Json } from "@supertrainer/db/types";

import { trackServer } from "@/lib/analytics/server";
import { serializeIntakeForBrief, summarizeHealthFlags } from "@/lib/interview/brief";
import { dayNumber } from "@/lib/interview/pacing";
import { createServiceClient } from "@/lib/supabase/server";

// Stage B interview engine (Phase 2.5). Every turn is written server-side with
// the service role: the client owns their words, but the state machine, health
// flags, and intake are ours.

export type InterviewStatus = "in_progress" | "paused_health" | "complete";

export interface InterviewView {
  messages: { id: string; sender: string; body: string }[];
  status: InterviewStatus;
  section: InterviewSection | null;
  /** True when today's sections are done but later ones aren't unlocked yet. */
  waitingForNextDay: boolean;
}

type AnswersBySection = Record<string, SectionAnswers>;

const PAUSE_REPLY =
  "Thanks for telling me that — that's important. I'm going to have your coach look at this personally before we go any further, rather than guess. They'll pick this up with you shortly.";

// Per-client AI-call budget for the write path (MF-6 security audit finding).
// Every runTurn call can make up to two paid Claude calls — detectHealthFlags's
// cheap classify pass (unconditional — the health gate ALWAYS runs, even when
// throttled) and interviewTurn's expensive draft pass. The budget below gates
// the draft pass ONLY; nothing else bounds how often a client can invoke
// sendAnswer (a stable POST endpoint). A real interview is
// short: 6 sections (INTERVIEW_SECTIONS), each usually answered in a handful of
// messages, spread across up to 3 days. This rolling window is sized generously
// above any normal-cadence conversation, so it only ever engages a caller
// hammering the action in a loop. Exported so the regression test doesn't
// hardcode a number that could silently drift from the real cap.
export const INTERVIEW_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
export const MAX_CLIENT_MESSAGES_PER_WINDOW = 20;

export const THROTTLE_REPLY =
  "Let's pick this back up in a little bit — send your next answer again shortly.";

// The opener claim's TTL. last_prompt_at is bumped when a load claims the opener
// slot (leaseOpenerSlot); a concurrent load within this window backs off rather
// than re-posting/re-charging. Sized comfortably above one interviewTurn draft
// call, and short enough that a crashed opener is reclaimable soon after.
const OPENER_CLAIM_TTL_MS = 60 * 1000;

// Interview turns only. Bounded so a long thread can't unbounded-scan or ship
// the whole history to the browser (the real, paginated thread arrives in P6.1).
async function loadMessages(service: ReturnType<typeof createServiceClient>, clientId: string) {
  const { data } = await service
    .from("messages")
    .select("id, sender, body")
    .eq("client_id", clientId)
    .eq("kind", "interview")
    .order("created_at", { ascending: true })
    .limit(200);
  return (data ?? []).map((m) => ({
    id: m.id,
    sender: m.sender as string,
    body: m.body ?? "",
  }));
}

async function say(
  service: ReturnType<typeof createServiceClient>,
  orgId: string,
  clientId: string,
  sender: "assistant" | "client" | "system",
  body: string,
) {
  await service.from("messages").insert({
    org_id: orgId,
    client_id: clientId,
    sender,
    kind: "interview",
    body,
  });
}

// The trainer's confirmed voice, serialized for the agent prompt.
async function styleFor(
  service: ReturnType<typeof createServiceClient>,
  orgId: string,
): Promise<string> {
  const { data } = await service
    .from("style_profiles")
    .select("domain, profile")
    .eq("org_id", orgId)
    .eq("status", "confirmed");
  return serializeConfirmedStyles(data);
}

async function stateFor(service: ReturnType<typeof createServiceClient>, clientId: string) {
  const { data } = await service
    .from("interview_state")
    .select("client_id, org_id, section, answers, status, started_at, last_prompt_at")
    .eq("client_id", clientId)
    .maybeSingle();
  return data;
}

// MF-6: this client's interview replies within the rolling budget window.
// Counted from `messages` (the append-only record of record) rather than a
// separate counter column, so it can never drift from what actually happened
// and self-corrects if a turn fails partway through.
async function clientMessagesInWindow(
  service: ReturnType<typeof createServiceClient>,
  clientId: string,
): Promise<number> {
  const since = new Date(Date.now() - INTERVIEW_RATE_LIMIT_WINDOW_MS).toISOString();
  const { count } = await service
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("kind", "interview")
    .eq("sender", "client")
    .gte("created_at", since);
  return count ?? 0;
}

// Lease the opener slot with optimistic concurrency on last_prompt_at — the same
// CAS pattern runInterviewNudges uses (stall.ts:41-52). Only the caller that
// flips last_prompt_at from its previously-read value (NULL for a brand-new row,
// or the last-known timestamp for a day-boundary reopen) wins the row; everyone
// else backs off. That means concurrent loads — two tabs, a hover-prefetch
// racing a click, or two overlapping day-2+ reopens — post the opener and pay
// for the Sonnet call AT MOST ONCE.
//
// `section` is deliberately NOT written here: it's only advanced after the
// opener message is actually saved (see below). If the AI call after a
// successful lease throws, the DB's `section` marker stays put, so a later
// reload is still detected as "not yet opened" and re-leases cleanly instead of
// getting silently stuck.
async function leaseOpenerSlot(
  service: ReturnType<typeof createServiceClient>,
  clientId: string,
  lastPromptAt: string | null,
): Promise<boolean> {
  const query = service
    .from("interview_state")
    .update({ last_prompt_at: new Date().toISOString() })
    .eq("client_id", clientId)
    .eq("status", "in_progress");
  const guarded = lastPromptAt === null ? query.is("last_prompt_at", null) : query.eq("last_prompt_at", lastPromptAt);
  const { data: leased } = await guarded.select("client_id");
  return !!leased && leased.length > 0;
}

function view(
  messages: { id: string; sender: string; body: string }[],
  status: InterviewStatus,
  section: InterviewSection | null,
  waitingForNextDay: boolean,
): InterviewView {
  return { messages, status, section, waitingForNextDay };
}

// Starts the interview if needed (opening question) and returns the thread.
export async function ensureInterview(
  orgId: string,
  clientId: string,
  clientName?: string,
): Promise<InterviewView> {
  const service = createServiceClient();
  let state = await stateFor(service, clientId);

  if (!state) {
    await service.from("interview_state").insert({ client_id: clientId, org_id: orgId });
    state = await stateFor(service, clientId);
  }
  if (!state) throw new Error("interview state missing");

  const answers = (state.answers ?? {}) as AnswersBySection;
  let status = state.status as InterviewStatus;
  const day = dayNumber(state.started_at);
  const section = nextSection(answers, day);

  // Self-heal: a complete intake whose finalize didn't land (status still
  // in_progress) gets finalized on the next visit. completeIntake is idempotent.
  if (status === "in_progress" && isInterviewComplete(answers)) {
    await completeIntake(orgId, clientId, answers);
    status = "complete";
  }

  let messages = await loadMessages(service, clientId);

  // Opening turn: post the section opener when either (a) there's no history at
  // all (brand-new interview), or (b) the currently-open section has moved past
  // the section this row last posted for — e.g. a day-2+ reopen where a new
  // section just unlocked (`interview_state.section` tracks the last section a
  // turn actually ran for; `runTurn` keeps it in sync with `nextSection` on every
  // within-day advance, so a mismatch here can only mean a fresh day unlocked a
  // section nobody has been prompted for yet). Tolerant of an agent failure (no
  // API key in dev/CI) — the thread just opens empty rather than 500-ing the
  // page, and a later reload retries cleanly.
  //
  // Concurrency: last_prompt_at doubles as a short-lived opener CLAIM. A load
  // arriving while the winner's ~2-4s interviewTurn call is still in flight sees
  // a freshly-bumped last_prompt_at and backs off (openerClaimFresh) — that
  // recency guard is what makes the claim self-invalidating; leaseOpenerSlot's
  // plain CAS alone would re-match the already-leased value and let the second
  // caller through (it does not post the opener / advance `section` until AFTER
  // the AI call). The CAS still resolves the truly-simultaneous case (both reads
  // see the same pre-lease value), and a claim older than OPENER_CLAIM_TTL_MS is
  // reclaimable so a crashed opener call still retries. (Same claim-with-TTL
  // shape as the preview lock in lib/preview/generate.ts.)
  const openerClaimFresh =
    !!state.last_prompt_at &&
    Date.now() - new Date(state.last_prompt_at).getTime() < OPENER_CLAIM_TTL_MS;
  if (
    status === "in_progress" &&
    section &&
    (messages.length === 0 || section !== state.section) &&
    !openerClaimFresh
  ) {
    const leased = await leaseOpenerSlot(service, clientId, state.last_prompt_at);
    if (leased) {
      try {
        const turn = await interviewTurn({
          section,
          styleText: await styleFor(service, orgId),
          history: [],
          answersSoFar: answers[section] ?? {},
          clientMessage: "",
          clientName,
        });
        await say(service, orgId, clientId, "assistant", turn.reply);
        await service
          .from("interview_state")
          .update({ section, last_prompt_at: new Date().toISOString() })
          .eq("client_id", clientId);
        messages = await loadMessages(service, clientId);
      } catch (err) {
        console.error("[interview] opening turn failed:", err);
      }
    }
  }

  return view(messages, status, section, !section && status === "in_progress");
}

// One conversational turn. Health screening runs BEFORE the coaching agent — a
// disclosure pauses the interview instead of being coached around.
export async function runTurn(
  orgId: string,
  clientId: string,
  clientText: string,
  clientName?: string,
): Promise<InterviewView> {
  const service = createServiceClient();
  const state = await stateFor(service, clientId);
  if (!state) return ensureInterview(orgId, clientId, clientName);

  const status = state.status as InterviewStatus;
  if (status !== "in_progress") {
    return view(await loadMessages(service, clientId), status, null, false);
  }

  const text = clientText.trim().slice(0, 2000);
  if (!text) {
    const answers = (state.answers ?? {}) as AnswersBySection;
    const day = dayNumber(state.started_at);
    return view(await loadMessages(service, clientId), status, nextSection(answers, day), false);
  }

  const answers = (state.answers ?? {}) as AnswersBySection;
  const day = dayNumber(state.started_at);
  const section = nextSection(answers, day);

  // ── Per-client AI budget (MF-6) ─────────────────────────────────────────────
  // Bounds only the EXPENSIVE Sonnet draft (interviewTurn, further down). The
  // health gate below is deliberately NOT throttled: detectHealthFlags always
  // runs its full keyword ∪ classifier pass — the classifier is the cheap Haiku
  // call, and skipping it under load could miss a nuance-only disclosure the
  // keyword list can't catch. So a genuine disclosure ALWAYS pauses; only a
  // non-flagged, over-budget turn is short-circuited before the draft call.
  const throttled =
    (await clientMessagesInWindow(service, clientId)) >= MAX_CLIENT_MESSAGES_PER_WINDOW;

  // ── HARD RULE: health disclosure pauses everything (always, even throttled) ─
  const flags: HealthFlagResult = await detectHealthFlags(text);
  if (flags.flagged) {
    await say(service, orgId, clientId, "client", text);

    const { data: client } = await service
      .from("clients")
      .select("health_flags")
      .eq("id", clientId)
      .maybeSingle();
    const existing = (client?.health_flags ?? {}) as Record<string, unknown>;
    // Merge — never clobber allergens captured at the teaser.
    await service
      .from("clients")
      .update({
        health_flags: {
          ...existing,
          interview: {
            categories: flags.categories,
            matched: flags.matched,
            source: flags.source,
            excerpt: text.slice(0, 300),
            raised_at: new Date().toISOString(),
          },
        } as Json,
      })
      .eq("id", clientId);

    await service
      .from("interview_state")
      .update({ status: "paused_health" })
      .eq("client_id", clientId);
    await say(service, orgId, clientId, "assistant", PAUSE_REPLY);

    // The signal Phase 7's review queue surfaces to the trainer.
    await trackServer({
      orgId,
      event: "health_flag_raised",
      clientId,
      properties: { categories: flags.categories, source: flags.source },
    });

    return view(await loadMessages(service, clientId), "paused_health", null, false);
  }

  if (throttled) {
    // Over budget and no health flag: skip the paid draft call entirely. Still
    // record the exchange (nothing is silently dropped — a normal-cadence
    // interview never reaches this branch, so this is not the common path).
    await say(service, orgId, clientId, "client", text);
    await say(service, orgId, clientId, "assistant", THROTTLE_REPLY);
    return view(await loadMessages(service, clientId), status, section, !section);
  }

  if (!section) {
    // Nothing open. If the intake is actually complete, finalize (self-heals a
    // prior completeIntake that didn't land); otherwise it's the between-days wait.
    if (isInterviewComplete(answers)) {
      await completeIntake(orgId, clientId, answers);
      return view(await loadMessages(service, clientId), "complete", null, false);
    }
    return view(await loadMessages(service, clientId), status, null, true);
  }

  // Load history BEFORE recording this message so the model doesn't see the
  // client's newest line twice (it's passed separately as clientMessage). And if
  // interviewTurn throws, NOTHING is recorded — the client's retry is clean, not
  // an orphaned message duplicated on every attempt.
  const history = (await loadMessages(service, clientId)).map((m) => ({
    sender: m.sender === "client" ? ("client" as const) : ("assistant" as const),
    body: m.body,
  }));

  const turn = await interviewTurn({
    section,
    styleText: await styleFor(service, orgId),
    history: history.slice(-12),
    answersSoFar: answers[section] ?? {},
    clientMessage: text,
    clientName,
  });

  // Merge what we learned; code (not the model) decides completion.
  const merged: AnswersBySection = {
    ...answers,
    [section]: { ...(answers[section] ?? {}), ...turn.parsed },
  };
  const done = isInterviewComplete(merged);
  const next = nextSection(merged, day);

  await say(service, orgId, clientId, "client", text);
  await say(service, orgId, clientId, "assistant", turn.reply);

  // Save progress. status='complete' is set only by completeIntake, and only
  // AFTER the intake is assembled and plan_requests are queued — so a failure
  // there can never leave a 'complete' interview with no intake.
  await service
    .from("interview_state")
    .update({
      answers: merged as Json,
      section: next ?? section,
      last_prompt_at: new Date().toISOString(),
    })
    .eq("client_id", clientId);

  if (done) await completeIntake(orgId, clientId, merged);

  return view(
    await loadMessages(service, clientId),
    done ? "complete" : "in_progress",
    next,
    !next && !done,
  );
}

// Assembles the intake, propagates timezone/language, queues the P4/P5 work, and
// ONLY THEN marks the interview complete — so a mid-way failure never leaves a
// 'complete' interview with no intake or plan_requests. Idempotent, so the
// self-heal retry (runTurn / ensureInterview) can't double-queue plan_requests
// or double-fire the event.
async function completeIntake(
  orgId: string,
  clientId: string,
  answers: AnswersBySection,
): Promise<void> {
  const service = createServiceClient();

  const { data: client } = await service
    .from("clients")
    .select("intake, profile_id, brief, health_flags")
    .eq("id", clientId)
    .maybeSingle();

  // Preserve the teaser/import intake; add Stage B under its own key.
  const intake = {
    ...((client?.intake ?? {}) as Record<string, unknown>),
    stage_b: answers,
    stage_b_completed_at: new Date().toISOString(),
  };
  await service.from("clients").update({ intake: intake as Json }).eq("id", clientId);

  // Phase 3 reads these off the profile, not the intake blob.
  const logistics = (answers.logistics ?? {}) as { timezone?: string; preferredLanguage?: string };
  if (client?.profile_id && (logistics.timezone || logistics.preferredLanguage)) {
    await service
      .from("profiles")
      .update({
        ...(logistics.timezone ? { timezone: logistics.timezone } : {}),
        ...(logistics.preferredLanguage ? { locale: logistics.preferredLanguage } : {}),
      })
      .eq("id", client.profile_id);
  }

  // Queue one diet + one split draft (idempotent — skip if already queued from a
  // prior finalize attempt). They sit 'queued' until the P4/P5 pipelines exist.
  const { count: existing } = await service
    .from("plan_requests")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("trigger", "onboarding");
  if ((existing ?? 0) === 0) {
    const { error: queueError } = await service.from("plan_requests").insert([
      { org_id: orgId, client_id: clientId, kind: "diet", trigger: "onboarding" },
      { org_id: orgId, client_id: clientId, kind: "split", trigger: "onboarding" },
    ]);
    // The partial-unique index is the real backstop: a concurrent finalize that
    // slipped past the count-check hits 23505 here. That means the rows already
    // exist (the winner queued them and fired intake_complete once) — treat it
    // as a no-op and do NOT re-fire the event. Any other error still surfaces.
    if (queueError && queueError.code !== "23505") {
      throw new Error(`failed to queue plan_requests: ${queueError.message}`);
    }
    if (!queueError) {
      await trackServer({ orgId, event: "intake_complete", clientId });
    }
  }

  // Mark complete LAST — every downstream artifact now exists.
  await service
    .from("interview_state")
    .update({ status: "complete" })
    .eq("client_id", clientId);

  // PO-5: draft the trainer's client brief. Best-effort and guarded on
  // clients.brief being absent — a paid draft call that must never block a
  // completed intake, and that self-heal retries must not re-pay for once it
  // exists. The health-flag list is derived in CODE (authoritative) and stored
  // alongside the model's neutral prose, so the model can neither drop nor invent
  // a flag. Runs after completion is committed, so a failure here leaves a fully
  // valid completed interview — the brief just fills in on the next finalize pass.
  if (!client?.brief) {
    try {
      const healthFlags = summarizeHealthFlags(client?.health_flags);
      const intakeName = (intake as Record<string, unknown>).name;
      const draft = await generateClientBrief({
        clientName: typeof intakeName === "string" ? intakeName : undefined,
        intakeText: serializeIntakeForBrief(intake),
        healthFlags,
      });
      await service
        .from("clients")
        .update({
          brief: { ...draft, healthFlags } as Json,
          brief_generated_at: new Date().toISOString(),
        })
        .eq("id", clientId);
      await trackServer({ orgId, event: "client_brief_generated", clientId });
    } catch (err) {
      console.error("[interview] client brief generation failed (intake still complete):", err);
    }
  }
}
