import { expect, test } from "@playwright/test";

import type { Json } from "@supertrainer/db/types";

import { consentClient, seedClient, serviceClient, uniqueEmail } from "./helpers";

// The stall-nudge cron: a scheduled tick nudges an interview idle >24h that
// still has an open section, and never one that's merely between-days waiting.

// Seeds a consented client with an in_progress interview. `answers` decides
// whether a section is open; `lastPromptHoursAgo` drives idle-ness.
async function seedStalledInterview(opts: {
  answers: Record<string, unknown>;
  startedDaysAgo: number;
  lastPromptHoursAgo: number;
}) {
  const { userId, orgId } = await seedClient(uniqueEmail("nudge"));
  await consentClient(userId);
  const service = serviceClient();
  const { data: client } = await service
    .from("clients")
    .select("id")
    .eq("profile_id", userId)
    .single();
  const clientId = client!.id;

  await service.from("interview_state").insert({
    client_id: clientId,
    org_id: orgId,
    answers: opts.answers as Json,
    status: "in_progress",
    started_at: new Date(Date.now() - opts.startedDaysAgo * 86_400_000).toISOString(),
    last_prompt_at: new Date(Date.now() - opts.lastPromptHoursAgo * 3_600_000).toISOString(),
    nudges_sent: 0,
  });
  return { clientId, orgId };
}

async function nudgeMessageCount(clientId: string) {
  const service = serviceClient();
  const { count } = await service
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("kind", "interview")
    .eq("sender", "assistant");
  return count ?? 0;
}

test("cron nudges an idle interview with an open section, once", async ({ request }) => {
  test.skip(!process.env.CRON_SECRET, "CRON_SECRET not set in this env");
  // Empty answers → logistics is open. Idle 25h → due.
  const { clientId } = await seedStalledInterview({
    answers: {},
    startedDaysAgo: 2,
    lastPromptHoursAgo: 25,
  });

  const before = await nudgeMessageCount(clientId);
  const res = await request.get("/api/cron/interview-nudges", {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(res.status()).toBe(200);
  expect((await res.json()).nudged).toBeGreaterThanOrEqual(1);

  expect(await nudgeMessageCount(clientId)).toBe(before + 1);
  const service = serviceClient();
  const { data: state } = await service
    .from("interview_state")
    .select("nudges_sent")
    .eq("client_id", clientId)
    .single();
  expect(state!.nudges_sent).toBe(1);

  // Second tick immediately after: not due (last_prompt_at is now recent).
  await request.get("/api/cron/interview-nudges", {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(await nudgeMessageCount(clientId)).toBe(before + 1);
});

test("cron does NOT nudge an interview that's merely waiting for the next day", async ({
  request,
}) => {
  test.skip(!process.env.CRON_SECRET, "CRON_SECRET not set in this env");
  // Day-1 sections done, started today → nextSection is null (waiting for day 2).
  // Idle timestamp is artificially old to isolate the open-section guard.
  const { clientId } = await seedStalledInterview({
    answers: {
      logistics: { timezone: "UTC", preferredLanguage: "English", weighInDays: ["Mon"] },
      goals: { primaryGoal: "lose fat" },
    },
    startedDaysAgo: 0,
    lastPromptHoursAgo: 25,
  });

  const before = await nudgeMessageCount(clientId);
  await request.get("/api/cron/interview-nudges", {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(await nudgeMessageCount(clientId)).toBe(before);
});

test("cron endpoint rejects an unauthenticated call", async ({ request }) => {
  const res = await request.get("/api/cron/interview-nudges");
  expect([401, 503]).toContain(res.status());
});
