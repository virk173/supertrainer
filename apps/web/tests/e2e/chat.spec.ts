import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { consentClient, serviceClient, uniqueEmail } from "./helpers";

// Phase 6.1 — the realtime thread. These are the DoD browser tests: a two-context
// realtime exchange (client sends → trainer receives live, and back), the typing
// indicator, the transparency render (assistant/system never look like the coach),
// and offline send-on-reconnect with no duplication. No AI is involved in 6.1, so
// every test here is CI-safe.

interface Pair {
  orgId: string;
  clientId: string;
  clientUserId: string;
  trainerToken: string;
  clientToken: string;
}

// A trainer (owner) and a client in the SAME org, both consented + magic-linked.
async function seedPair(): Promise<Pair> {
  const service = serviceClient();

  const trainerEmail = uniqueEmail("coach");
  const { data: tUser, error: tErr } = await service.auth.admin.createUser({
    email: trainerEmail,
    email_confirm: true,
  });
  if (tErr) throw tErr;
  const trainerId = tUser!.user!.id;

  const { data: org, error: orgErr } = await service
    .from("orgs")
    .insert({ name: "Coach Dana", slug: `chat-${randomUUID().slice(0, 8)}` })
    .select("id")
    .single();
  if (orgErr) throw orgErr;
  const orgId = org!.id;

  await service.from("profiles").insert({
    id: trainerId,
    org_id: orgId,
    role: "owner",
    display_name: "Dana",
  });

  const clientEmail = uniqueEmail("client");
  const { data: cUser, error: cErr } = await service.auth.admin.createUser({
    email: clientEmail,
    email_confirm: true,
  });
  if (cErr) throw cErr;
  const clientUserId = cUser!.user!.id;

  await service.from("profiles").insert({
    id: clientUserId,
    org_id: orgId,
    role: "client",
    display_name: "Sam",
  });
  const { data: clientRow, error: clErr } = await service
    .from("clients")
    .insert({ org_id: orgId, profile_id: clientUserId, status: "active", source: "invite" })
    .select("id")
    .single();
  if (clErr) throw clErr;
  const clientId = clientRow!.id;

  await consentClient(clientUserId);

  const { data: tLink } = await service.auth.admin.generateLink({ type: "magiclink", email: trainerEmail });
  const { data: cLink } = await service.auth.admin.generateLink({ type: "magiclink", email: clientEmail });

  return {
    orgId,
    clientId,
    clientUserId,
    trainerToken: tLink!.properties!.hashed_token,
    clientToken: cLink!.properties!.hashed_token,
  };
}

async function signInTo(page: Page, tokenHash: string, next: string): Promise<void> {
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=${encodeURIComponent(next)}`);
  await page.waitForURL(`**${next}`);
}

test("two-context realtime: client sends → trainer receives live, and back, with typing", async ({ browser }) => {
  const pair = await seedPair();

  const clientCtx = await browser.newContext();
  const trainerCtx = await browser.newContext();
  const clientPage = await clientCtx.newPage();
  const trainerPage = await trainerCtx.newPage();

  await signInTo(clientPage, pair.clientToken, "/portal/chat");
  await signInTo(trainerPage, pair.trainerToken, `/trainer/chat/${pair.clientId}`);

  // Both threads mounted + subscribed.
  await expect(clientPage.getByTestId("chat-thread")).toBeVisible();
  await expect(trainerPage.getByTestId("chat-thread")).toBeVisible();
  // Give the postgres_changes subscriptions a beat to go SUBSCRIBED before the
  // first send (an event fired before subscribe would never be delivered).
  await clientPage.waitForTimeout(1200);

  // ── typing indicator: client starts typing → trainer sees it ───────────────
  await clientPage.getByTestId("chat-input").fill("hey coach, quick question");
  await expect(trainerPage.getByTestId("typing-indicator")).toBeVisible({ timeout: 10_000 });

  // ── client sends → trainer receives live ───────────────────────────────────
  await clientPage.getByTestId("chat-send").click();
  const trainerSeesClient = trainerPage
    .getByTestId("msg-client")
    .filter({ hasText: "hey coach, quick question" });
  await expect(trainerSeesClient).toBeVisible({ timeout: 10_000 });

  // ── trainer replies → client receives live, rendered as the coach ──────────
  await trainerPage.getByTestId("chat-input").fill("go for it — what's up?");
  await trainerPage.getByTestId("chat-send").click();
  const clientSeesCoach = clientPage
    .getByTestId("msg-coach")
    .filter({ hasText: "go for it — what's up?" });
  await expect(clientSeesCoach).toBeVisible({ timeout: 10_000 });
  // The coach line carries the trainer avatar (transparency: it's a real human).
  await expect(clientSeesCoach.getByTestId("coach-avatar")).toBeVisible();

  await clientCtx.close();
  await trainerCtx.close();
});

test("transparency: assistant and system messages never render as the coach", async ({ browser }) => {
  const pair = await seedPair();
  const service = serviceClient();

  // Seed one of each voice into the client's thread (service role — the only
  // writer). The classifier is unit-tested; this proves the RENDER honours it.
  await service.from("messages").insert([
    { org_id: pair.orgId, client_id: pair.clientId, sender: "coach", kind: "text", body: "coach line here" },
    { org_id: pair.orgId, client_id: pair.clientId, sender: "assistant", kind: "text", body: "assistant line here" },
    { org_id: pair.orgId, client_id: pair.clientId, sender: "system", kind: "reminder", body: "automated reminder here" },
  ]);

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signInTo(page, pair.clientToken, "/portal/chat");

  const coachMsg = page.getByTestId("msg-coach").filter({ hasText: "coach line here" });
  const assistantMsg = page.getByTestId("msg-assistant").filter({ hasText: "assistant line here" });
  const systemMsg = page.getByTestId("msg-system").filter({ hasText: "automated reminder here" });

  await expect(coachMsg).toBeVisible();
  await expect(assistantMsg).toBeVisible();
  await expect(systemMsg).toBeVisible();

  // The coach avatar appears on the coach line and NOWHERE else.
  await expect(coachMsg.getByTestId("coach-avatar")).toBeVisible();
  await expect(assistantMsg.getByTestId("coach-avatar")).toHaveCount(0);
  await expect(systemMsg.getByTestId("coach-avatar")).toHaveCount(0);

  // The AI/automated messages carry their explicit labels.
  await expect(assistantMsg.getByTestId("ai-label")).toContainText("AI assistant");
  await expect(systemMsg.getByTestId("ai-label")).toContainText("Automated");

  await ctx.close();
});

test("portal shows the push-degraded banner and the chat unread badge", async ({ browser }) => {
  const pair = await seedPair();
  const service = serviceClient();

  // All push endpoints died → degraded; plus one unread coach line → badge count.
  await service.from("clients").update({ push_degraded_at: new Date().toISOString() }).eq("id", pair.clientId);
  await service.from("messages").insert({
    org_id: pair.orgId,
    client_id: pair.clientId,
    sender: "coach",
    kind: "text",
    body: "unread coach line",
  });

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signInTo(page, pair.clientToken, "/portal");

  await expect(page.getByTestId("push-degraded-banner")).toBeVisible();
  const badge = page.getByTestId("chat-badge");
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText("1");

  await ctx.close();
});

test("a client message that trips the escalation floor gets an automated holding line", async ({ browser }) => {
  const pair = await seedPair();
  const service = serviceClient();

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signInTo(page, pair.clientToken, "/portal/chat");
  await expect(page.getByTestId("chat-thread")).toBeVisible();

  // No ANTHROPIC_API_KEY in CI → the classifier is down, but the deterministic
  // keyword floor still fires on "pain" → escalation → holding line.
  await page.getByTestId("chat-input").fill("my knee is in a lot of pain after squats");
  await page.getByTestId("chat-send").click();

  // The automated SYSTEM holding line arrives in the thread.
  const holdingLine = page.getByTestId("msg-system").filter({ hasText: "flagged" });
  await expect(holdingLine).toBeVisible({ timeout: 10_000 });
  await expect(holdingLine.getByTestId("coach-avatar")).toHaveCount(0); // never the coach

  // And the urgent queue item was recorded for the trainer.
  await expect
    .poll(async () => {
      const { data } = await service.from("escalations").select("id").eq("client_id", pair.clientId);
      return data?.length ?? 0;
    })
    .toBe(1);

  await ctx.close();
});

test("offline send is queued and replays on reconnect without duplicating", async ({ browser }) => {
  const pair = await seedPair();
  const service = serviceClient();

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signInTo(page, pair.clientToken, "/portal/chat");
  await expect(page.getByTestId("chat-thread")).toBeVisible();

  const body = `offline-note-${randomUUID().slice(0, 8)}`;

  // Go offline, then send: runOrQueue sees navigator.onLine === false and stores
  // the write in IndexedDB (optimistic bubble stays), never hitting the network.
  await ctx.setOffline(true);
  await page.getByTestId("chat-input").fill(body);
  await page.getByTestId("chat-send").click();
  await expect(page.getByTestId("msg-client").filter({ hasText: body })).toBeVisible();

  // Nothing persisted while offline.
  const before = await service
    .from("messages")
    .select("id")
    .eq("client_id", pair.clientId)
    .eq("body", body);
  expect(before.data?.length ?? 0).toBe(0);

  // Reconnect → the 'online' event flushes the queue → the send lands exactly once
  // (the (client_id, client_tag) unique index makes a replay idempotent).
  await ctx.setOffline(false);
  await expect
    .poll(
      async () => {
        const { data } = await service
          .from("messages")
          .select("id")
          .eq("client_id", pair.clientId)
          .eq("body", body);
        return data?.length ?? 0;
      },
      { timeout: 15_000 },
    )
    .toBe(1);

  // Still on screen, still a single copy.
  await expect(page.getByTestId("msg-client").filter({ hasText: body })).toHaveCount(1);

  await ctx.close();
});
