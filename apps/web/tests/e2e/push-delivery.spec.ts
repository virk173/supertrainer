import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { buildDigestEmail, snippetOf } from "@/lib/push/digest";
import { runDeliveryLadder } from "@/lib/push/worker";
import type { PushFn, PushResult } from "@/lib/push/send";

import { serviceClient, uniqueEmail } from "./helpers";

// Phase 6.2 — the delivery worker + digest, driven with an injected pusher so the
// real control flow (ladder transitions, dead-endpoint pruning, degradation,
// digest grouping) runs with zero network. CI-safe.

interface DeliveryClient {
  orgId: string;
  clientId: string;
}

async function seedDeliveryClient(channel: "push" | "email_only"): Promise<DeliveryClient> {
  const service = serviceClient();
  const email = uniqueEmail("push");
  const { data: user } = await service.auth.admin.createUser({ email, email_confirm: true });
  const userId = user!.user!.id;
  const { data: org } = await service
    .from("orgs")
    .insert({ name: "Push Coach", slug: `push-${randomUUID().slice(0, 8)}` })
    .select("id")
    .single();
  const orgId = org!.id;
  await service.from("profiles").insert({ id: userId, org_id: orgId, role: "client", display_name: "Pat" });
  const { data: client } = await service
    .from("clients")
    .insert({ org_id: orgId, profile_id: userId, status: "active", source: "invite", notification_channel: channel })
    .select("id")
    .single();
  return { orgId, clientId: client!.id };
}

async function addSub(c: DeliveryClient): Promise<string> {
  const service = serviceClient();
  const { data } = await service
    .from("push_subscriptions")
    .insert({
      org_id: c.orgId,
      client_id: c.clientId,
      endpoint: `https://push.example/${randomUUID()}`,
      keys: { p256dh: "test-p256dh", auth: "test-auth" },
    })
    .select("id")
    .single();
  return data!.id;
}

async function enqueue(
  c: DeliveryClient,
  over: { stage?: string; sent_at?: string; payload?: Record<string, unknown> } = {},
): Promise<string> {
  const service = serviceClient();
  const { data } = await service
    .from("notifications")
    .insert({
      org_id: c.orgId,
      client_id: c.clientId,
      kind: "message",
      channel: "push",
      status: "queued",
      dedupe_key: `t:${randomUUID()}`,
      stage: over.stage ?? "queued",
      sent_at: over.sent_at ?? null,
      payload: (over.payload ?? { snippet: "hey, checking in on today" }) as never,
    })
    .select("id")
    .single();
  return data!.id;
}

const okPush: PushFn = async () => ({ ok: true }) as PushResult;
const deadPush: PushFn = async () => ({ dead: true }) as PushResult;

async function stageOf(id: string): Promise<{ stage: string; sent_at: string | null }> {
  const { data } = await serviceClient().from("notifications").select("stage, sent_at").eq("id", id).single();
  return data as { stage: string; sent_at: string | null };
}

test("fresh notification with live push, daytime → pushed", async () => {
  const c = await seedDeliveryClient("push");
  await addSub(c);
  const id = await enqueue(c);

  let calls = 0;
  const push: PushFn = async () => {
    calls++;
    return { ok: true };
  };
  const res = await runDeliveryLadder(serviceClient(), new Date("2026-07-23T12:00:00Z"), {
    clientIds: [c.clientId],
    push,
  });
  expect(calls).toBe(1);
  expect(res.pushed).toBe(1);
  const n = await stageOf(id);
  expect(n.stage).toBe("pushed");
  expect(n.sent_at).not.toBeNull();
});

test("quiet hours holds the push (queued stays queued, no push sent)", async () => {
  const c = await seedDeliveryClient("push");
  await addSub(c);
  const id = await enqueue(c);

  let calls = 0;
  const push: PushFn = async () => {
    calls++;
    return { ok: true };
  };
  // 23:00 UTC local (default quiet window 21:30–07:30) → hold.
  const res = await runDeliveryLadder(serviceClient(), new Date("2026-07-23T23:00:00Z"), {
    clientIds: [c.clientId],
    push,
  });
  expect(calls).toBe(0);
  expect(res.pushed).toBe(0);
  expect((await stageOf(id)).stage).toBe("queued");
});

test("dead endpoint is pruned, notification falls to badge, client is degraded", async () => {
  const c = await seedDeliveryClient("push");
  const subId = await addSub(c);
  const id = await enqueue(c);

  const res = await runDeliveryLadder(serviceClient(), new Date("2026-07-23T12:00:00Z"), {
    clientIds: [c.clientId],
    push: deadPush,
  });
  expect(res.pruned).toBe(1);
  expect(res.badged).toBe(1);
  expect(res.degraded).toBe(1);

  const service = serviceClient();
  const { data: sub } = await service.from("push_subscriptions").select("revoked_at").eq("id", subId).single();
  expect(sub!.revoked_at).not.toBeNull(); // pruned (soft-revoked)
  expect((await stageOf(id)).stage).toBe("badged"); // fell back to the in-app badge
  const { data: client } = await service
    .from("clients")
    .select("notification_channel, push_degraded_at")
    .eq("id", c.clientId)
    .single();
  expect(client!.notification_channel).toBe("email_only"); // auto-downgraded
  expect(client!.push_degraded_at).not.toBeNull();
});

test("pushed-but-unseen escalates to badge only after 4h", async () => {
  const c = await seedDeliveryClient("push");
  await addSub(c);
  const fresh = await enqueue(c, { stage: "pushed", sent_at: "2026-07-23T11:00:00Z" }); // 1h ago
  const stale = await enqueue(c, { stage: "pushed", sent_at: "2026-07-23T06:00:00Z" }); // 6h ago

  await runDeliveryLadder(serviceClient(), new Date("2026-07-23T12:00:00Z"), { clientIds: [c.clientId], push: okPush });

  expect((await stageOf(fresh)).stage).toBe("pushed"); // held
  expect((await stageOf(stale)).stage).toBe("badged"); // escalated
});

test("badged-but-unseen joins the evening digest and emails once, snippet only", async () => {
  const c = await seedDeliveryClient("push");
  const longLine = "Great work today — remember to hit your protein and log dinner before bed, and get some sleep!";
  const id = await enqueue(c, { stage: "badged", payload: { copy: longLine } });

  const digestCalls: { to: string; items: { firstLine: string }[] }[] = [];
  const sendDigest = async (to: string, params: { items: { firstLine: string }[] }) => {
    digestCalls.push({ to, items: params.items });
    return { sent: true };
  };

  // 20:30 UTC local → past the 20:00 digest cutoff.
  const res = await runDeliveryLadder(serviceClient(), new Date("2026-07-23T20:30:00Z"), {
    clientIds: [c.clientId],
    push: okPush,
    sendDigest,
  });
  expect(res.digested).toBe(1);
  expect(res.emailed).toBe(1);
  expect(digestCalls).toHaveLength(1);
  expect(digestCalls[0]!.items[0]!.firstLine).toBe(longLine);
  expect((await stageOf(id)).stage).toBe("digested");

  // The rendered email carries only a truncated snippet — never the full line.
  const { html } = buildDigestEmail({ trainerName: "Coach", items: [{ firstLine: longLine }], portalUrl: "https://x/portal" });
  expect(html).not.toContain(longLine);
  expect(html).toContain(snippetOf(longLine));
});

test("snippetOf truncates long text and passes short text through", () => {
  expect(snippetOf("short line")).toBe("short line");
  const long = "x".repeat(80);
  const s = snippetOf(long);
  expect(s.length).toBeLessThanOrEqual(48);
  expect(s.endsWith("…")).toBe(true);
});
