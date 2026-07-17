import { expect, test, type Page } from "@playwright/test";

import type { Json } from "@supertrainer/db/types";

import { keywordHealthFlags } from "../../../../packages/ai/src/escalation";
import {
  isInterviewComplete,
  isSectionComplete,
  nextSection,
} from "../../../../packages/ai/src/interview";
import { isNudgeDue } from "../../lib/interview/nudge";
import { consentClient, seedClient, serviceClient, uniqueEmail } from "./helpers";

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
  opts: { answers?: Record<string, unknown>; backdateDays?: number } = {},
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
  await service.from("interview_state").insert({
    client_id: clientId,
    org_id: orgId,
    answers: (opts.answers ?? {}) as Json,
    started_at: startedAt,
  });
  await service.from("messages").insert({
    org_id: orgId,
    client_id: clientId,
    sender: "assistant",
    kind: "interview",
    body: "Hey! Quick one to start — what timezone are you in?",
  });
  // Allergens from the teaser must survive a later health-flag merge.
  await service
    .from("clients")
    .update({ health_flags: { allergens: ["Peanuts"] } })
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
    allergens?: string[];
    interview?: { categories?: string[]; excerpt?: string };
  };
  expect(flags.interview?.categories).toEqual(
    expect.arrayContaining(["condition", "medication"]),
  );
  expect(flags.interview?.excerpt).toContain("metformin");
  // The teaser's allergens must not be clobbered by the flag merge.
  expect(flags.allergens).toEqual(["Peanuts"]);

  const { data: events } = await service
    .from("events")
    .select("type")
    .eq("org_id", orgId)
    .eq("type", "health_flag_raised");
  expect((events ?? []).length).toBe(1);
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
