import { expect, test, type Page } from "@playwright/test";

import type { Json } from "@supertrainer/db/types";

import { keywordHealthFlags } from "../../../../packages/ai/src/escalation";
import {
  isInterviewComplete,
  isSectionComplete,
  nextSection,
  type InterviewSection,
  type SectionAnswers,
} from "../../../../packages/ai/src/interview";
import { dayNumber } from "../../lib/interview/pacing";
import { isNudgeDue } from "../../lib/interview/nudge";
import { consentClient, seedClient, serviceClient, uniqueEmail } from "./helpers";

// DoD: the client funnel is verified on a phone viewport (mobile-first).
test.use({ viewport: { width: 390, height: 844 } });

// ── Pure logic (node-level, no browser, no AI) ───────────────────────────────

test("health keyword gate flags disclosures and ignores ordinary training talk", () => {
  expect(keywordHealthFlags("I'm type 2 diabetic and take metformin").categories).toEqual(
    expect.arrayContaining(["condition", "medication"]),
  );
  expect(keywordHealthFlags("I'm 5 months pregnant").categories).toContain("pregnancy");
  expect(keywordHealthFlags("my ACL is torn, had surgery").categories).toContain("injury");
  expect(keywordHealthFlags("I've been bingeing and using laxatives").categories).toContain(
    "eating_disorder",
  );
  // Hyphenated spellings must still fire on the keyword floor.
  expect(keywordHealthFlags("thoughts of self-harm").categories).toContain("eating_disorder");
  expect(keywordHealthFlags("I take a beta-blocker daily").categories).toContain("medication");
  // Must NOT flag ordinary soreness/goals — a gate that cries wolf gets ignored.
  expect(keywordHealthFlags("my legs are sore after squats").categories).toEqual([]);
  expect(keywordHealthFlags("I want to lose 5kg and get stronger").categories).toEqual([]);
  // Word-boundary matched: "pillow"/"hearty" must not trip "pill"/"heart".
  expect(keywordHealthFlags("I need a new pillow, had a hearty meal").categories).toEqual([]);
});

test("section completion requires the fields Phase 3 depends on", () => {
  expect(isSectionComplete("logistics", {})).toBe(false);
  expect(isSectionComplete("logistics", { timezone: "Asia/Kolkata" })).toBe(false);
  expect(
    isSectionComplete("logistics", {
      timezone: "Asia/Kolkata",
      preferredLanguage: "English",
      weighInDays: ["Mon"],
    }),
  ).toBe(true);
  // meals/day + meal times are the Phase 3 reminder defaults.
  expect(isSectionComplete("nutrition", { mealsPerDay: 3 })).toBe(false);
  expect(isSectionComplete("nutrition", { mealsPerDay: 3, mealTimes: ["08:00"] })).toBe(true);
  // An empty health section must not read as "asked and answered".
  expect(isSectionComplete("health", {})).toBe(false);
  expect(isSectionComplete("health", { nothingToReport: true })).toBe(true);
});

test("pacing unlocks sections across days 1-3 and completion needs them all", () => {
  const done = {
    logistics: { timezone: "UTC", preferredLanguage: "English", weighInDays: ["Mon"] },
    goals: { primaryGoal: "lose fat" },
  };
  // Day 1: logistics+goals done → nothing else is unlocked yet.
  expect(nextSection(done, 1)).toBeNull();
  // Day 2 unlocks nutrition.
  expect(nextSection(done, 2)).toBe("nutrition");
  expect(nextSection({}, 1)).toBe("logistics");
  expect(isInterviewComplete(done)).toBe(false);
});

test("idle nudge is due after 24h and capped at 2", () => {
  const now = Date.parse("2026-07-16T12:00:00Z");
  const dayAgo = "2026-07-15T11:00:00Z";
  const hourAgo = "2026-07-16T11:00:00Z";
  expect(isNudgeDue(dayAgo, 0, now)).toBe(true);
  expect(isNudgeDue(hourAgo, 0, now)).toBe(false);
  expect(isNudgeDue(dayAgo, 2, now)).toBe(false); // capped
  expect(isNudgeDue(null, 0, now)).toBe(false);
});

// ── Engine integration (browser) ─────────────────────────────────────────────

// Seeds a consented client with an interview already open. Seeding a first
// message means the page won't spend an AI call on an opening question, which
// keeps the health-flag test runnable without an API key.
async function seedInterviewClient(
  page: Page,
  prefix: string,
  opts: {
    answers?: Record<string, unknown>;
    backdateDays?: number;
    /**
     * The section `interview_state.section` should hold, i.e. the last section a
     * turn actually ran (and posted an opener) for. Defaults to whatever's
     * currently open for `answers`/`backdateDays` — correct for tests that don't
     * care about the day-boundary opener gap. Pass this explicitly to simulate a
     * PRIOR day's state (e.g. `section: "goals"` with day-1-only answers) so a
     * later reload can exercise ensureInterview's day-2+ opener detection.
     */
    section?: InterviewSection;
  } = {},
) {
  const { userId, orgId, tokenHash } = await seedClient(uniqueEmail(prefix));
  await consentClient(userId);

  const service = serviceClient();
  const { data: client } = await service
    .from("clients")
    .select("id")
    .eq("profile_id", userId)
    .single();
  const clientId = client!.id;

  const startedAt = new Date(
    Date.now() - (opts.backdateDays ?? 0) * 24 * 60 * 60 * 1000,
  ).toISOString();
  const answers = (opts.answers ?? {}) as Record<string, SectionAnswers>;
  const section = opts.section ?? nextSection(answers, dayNumber(startedAt)) ?? "logistics";
  await service.from("interview_state").insert({
    client_id: clientId,
    org_id: orgId,
    answers: answers as Json,
    section,
    started_at: startedAt,
  });
  await service.from("messages").insert({
    org_id: orgId,
    client_id: clientId,
    sender: "assistant",
    kind: "interview",
    body: "Hey! Quick one to start — what timezone are you in?",
  });
  // Allergens from the teaser must survive a later health-flag merge (the
  // canonical key is `allergies`, matching import/convert/demo).
  await service
    .from("clients")
    .update({ health_flags: { allergies: ["Peanuts"] } })
    .eq("id", clientId);

  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/welcome/interview`);
  await expect(page.getByTestId("interview-thread")).toBeVisible();
  return { orgId, clientId, userId };
}

test("a health disclosure pauses the interview and flags it for the trainer", async ({
  page,
}) => {
  const { orgId, clientId } = await seedInterviewClient(page, "interview-health");

  await page.getByTestId("interview-input").fill(
    "I'm in Chicago, but I should say I'm type 2 diabetic and take metformin",
  );
  await page.getByTestId("interview-send").click();

  // The interview stops and hands off to the human — it does not coach on.
  await expect(page.getByTestId("interview-paused")).toBeVisible();
  await expect(page.getByTestId("interview-input")).toHaveCount(0);

  const service = serviceClient();
  const { data: state } = await service
    .from("interview_state")
    .select("status")
    .eq("client_id", clientId)
    .single();
  expect(state?.status).toBe("paused_health");

  const { data: client } = await service
    .from("clients")
    .select("health_flags")
    .eq("id", clientId)
    .single();
  const flags = client?.health_flags as {
    allergies?: string[];
    interview?: { categories?: string[]; excerpt?: string };
  };
  expect(flags.interview?.categories).toEqual(
    expect.arrayContaining(["condition", "medication"]),
  );
  expect(flags.interview?.excerpt).toContain("metformin");
  // The teaser's allergies must not be clobbered by the flag merge.
  expect(flags.allergies).toEqual(["Peanuts"]);

  const { data: events } = await service
    .from("events")
    .select("type")
    .eq("org_id", orgId)
    .eq("type", "health_flag_raised");
  expect((events ?? []).length).toBe(1);
});

// LIVE: MF-2/MF-3 — a day-2+ reopen must post exactly one opener for the newly
// unlocked section (MF-3), not zero (the old messages.length===0-only gate) and
// not two (MF-2's missing lease). Day 1's logistics+goals are seeded complete
// with interview_state.section left at "goals" — the true post-day-1 value a
// real flow would leave it at — and started_at backdated a day so `dayNumber`
// reads 2. seedInterviewClient's own initial page load is the "day-2 reopen":
// ensureInterview must see section("nutrition") !== state.section("goals") and
// post nutrition's opener.
test("live: a day-2 reopen posts the newly-unlocked section's opener exactly once", async ({
  page,
}) => {
  test.skip(!process.env.ANTHROPIC_API_KEY, "needs ANTHROPIC_API_KEY for the opener's live turn");
  test.setTimeout(60_000);

  const { clientId } = await seedInterviewClient(page, "interview-day2", {
    backdateDays: 1,
    answers: {
      logistics: {
        timezone: "Asia/Kolkata",
        preferredLanguage: "English",
        weighInDays: ["Monday"],
      },
      goals: { primaryGoal: "lose fat" },
    },
    section: "goals",
  });

  const service = serviceClient();

  // Exactly 2 messages: day 1's seeded opener + day 2's new nutrition opener.
  const { data: messages } = await service
    .from("messages")
    .select("sender, created_at")
    .eq("client_id", clientId)
    .eq("kind", "interview")
    .order("created_at", { ascending: true });
  expect(messages).toHaveLength(2);
  expect(messages?.every((m) => m.sender === "assistant")).toBe(true);

  // The lease must have advanced the row to the section it just opened for.
  const { data: state } = await service
    .from("interview_state")
    .select("section, last_prompt_at")
    .eq("client_id", clientId)
    .single();
  expect(state?.section).toBe("nutrition");
  expect(state?.last_prompt_at).toBeTruthy();

  // The client sees the fresh nutrition prompt, not a stale day-1 bubble with an
  // open input the client's first reply would misread as an unprompted answer.
  await expect(page.getByTestId("interview-input")).toBeVisible();
});

// LIVE: the completion path — one real turn finishes the last section and must
// assemble the intake, propagate timezone, and queue the P4/P5 work.
test("live: finishing the last section assembles intake and queues plan requests", async ({
  page,
}) => {
  test.skip(!process.env.ANTHROPIC_API_KEY, "needs ANTHROPIC_API_KEY for a live turn");
  test.setTimeout(120_000);

  // Everything but `health` already captured; backdated so day-3 sections are open.
  const { orgId, clientId, userId } = await seedInterviewClient(page, "interview-done", {
    backdateDays: 3,
    answers: {
      logistics: {
        timezone: "Asia/Kolkata",
        preferredLanguage: "Hinglish",
        weighInDays: ["Monday", "Wednesday", "Saturday"],
      },
      goals: { primaryGoal: "build muscle" },
      nutrition: { mealsPerDay: 4, mealTimes: ["08:30", "13:00", "17:00", "21:00"] },
      training: { daysPerWeek: 5, equipmentAccess: "society gym with dumbbells" },
      lifestyle: { sleepHours: 7, workPattern: "desk job" },
    },
  });

  await page.getByTestId("interview-input").fill("Nothing to report, I'm all good health wise");
  await page.getByTestId("interview-send").click();

  await expect(page.getByTestId("interview-complete")).toBeVisible({ timeout: 60_000 });

  const service = serviceClient();
  const { data: state } = await service
    .from("interview_state")
    .select("status")
    .eq("client_id", clientId)
    .single();
  expect(state?.status).toBe("complete");

  // Intake assembled (and the teaser intake preserved alongside it).
  const { data: client } = await service
    .from("clients")
    .select("intake")
    .eq("id", clientId)
    .single();
  const intake = client?.intake as { stage_b?: Record<string, unknown>; stage_b_completed_at?: string };
  expect(intake.stage_b).toBeTruthy();
  expect(intake.stage_b_completed_at).toBeTruthy();
  expect((intake.stage_b as { nutrition?: { mealsPerDay?: number } }).nutrition?.mealsPerDay).toBe(4);

  // Phase 3 reads timezone/language off the profile.
  const { data: profile } = await service
    .from("profiles")
    .select("timezone, locale")
    .eq("id", userId)
    .single();
  expect(profile?.timezone).toBe("Asia/Kolkata");
  expect(profile?.locale).toBe("Hinglish");

  // Phase 4/5 work is queued and waiting.
  const { data: requests } = await service
    .from("plan_requests")
    .select("kind, trigger, status")
    .eq("client_id", clientId);
  expect(requests).toHaveLength(2);
  expect(requests!.map((r) => r.kind).sort()).toEqual(["diet", "split"]);
  for (const r of requests!) {
    expect(r.trigger).toBe("onboarding");
    expect(r.status).toBe("queued");
  }

  const { data: events } = await service
    .from("events")
    .select("type")
    .eq("org_id", orgId)
    .eq("type", "intake_complete");
  expect((events ?? []).length).toBe(1);
});
