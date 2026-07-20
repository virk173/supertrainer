import "server-only";

import {
  detectHealthFlags,
  interviewTurn,
  isInterviewComplete,
  nextSection,
  type InterviewSection,
  type SectionAnswers,
} from "@supertrainer/ai";
import type { Json } from "@supertrainer/db/types";

import { trackServer } from "@/lib/analytics/server";
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

// Day 1 on the day they start; sections unlock across days 1–3.
function dayNumber(startedAt: string): number {
  const days = Math.floor(
    (Date.now() - new Date(startedAt).getTime()) / (24 * 60 * 60 * 1000),
  );
  return Math.max(1, days + 1);
}

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
  return (data ?? [])
    .map((s) => `${s.domain} style: ${JSON.stringify(s.profile)}`)
    .join("\n");
}

async function stateFor(service: ReturnType<typeof createServiceClient>, clientId: string) {
  const { data } = await service
    .from("interview_state")
    .select("client_id, org_id, section, answers, status, started_at")
    .eq("client_id", clientId)
    .maybeSingle();
  return data;
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

  // Opening turn: no history yet and there's a section to run. Tolerant of an
  // agent failure (no API key in dev/CI) — the thread just opens empty rather
  // than 500-ing the page.
  if (messages.length === 0 && status === "in_progress" && section) {
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

  // ── HARD RULE: health disclosure pauses everything ────────────────────────
  const flags = await detectHealthFlags(text);
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

  const section = nextSection(answers, day);
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
    .select("intake, profile_id")
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
}
