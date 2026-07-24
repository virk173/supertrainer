import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { handleClientMessage } from "@/lib/comms/escalate";
import type { RoutingClassification } from "@supertrainer/ai";

import { serviceClient, uniqueEmail } from "./helpers";

// Phase 6.3 — the escalation handler DB path (db-injected, CI-safe). The keyword
// floor fires deterministically (no model); the classifier is injected only to
// prove non-escalation routing. Asserts the urgent queue row, the automated
// holding line, the self-harm crisis card, and the trainer event.

async function seed(): Promise<{ orgId: string; clientId: string }> {
  const service = serviceClient();
  const { data: user } = await service.auth.admin.createUser({ email: uniqueEmail("esc"), email_confirm: true });
  const { data: org } = await service
    .from("orgs")
    .insert({ name: "Coach Rae", slug: `esc-${randomUUID().slice(0, 8)}` })
    .select("id")
    .single();
  await service.from("profiles").insert({ id: user!.user!.id, org_id: org!.id, role: "client" });
  const { data: client } = await service
    .from("clients")
    .insert({ org_id: org!.id, profile_id: user!.user!.id, status: "active", source: "invite" })
    .select("id")
    .single();
  return { orgId: org!.id, clientId: client!.id };
}

async function seedMessage(orgId: string, clientId: string, body: string): Promise<string> {
  const { data } = await serviceClient()
    .from("messages")
    .insert({ org_id: orgId, client_id: clientId, sender: "client", kind: "text", body })
    .select("id")
    .single();
  return data!.id;
}

const throwingClassify = async (): Promise<RoutingClassification> => {
  throw new Error("no model in CI");
};

test("a keyword escalation records the queue item, holding line, and trainer event (classifier down)", async () => {
  const { orgId, clientId } = await seed();
  const text = "my knee is in a lot of pain after squats";
  const messageId = await seedMessage(orgId, clientId, text);

  const result = await handleClientMessage(
    serviceClient(),
    { orgId, clientId, messageId, text, coachName: "Rae" },
    { classify: throwingClassify }, // fail-closed: keyword floor still fires
  );
  expect(result.escalated).toBe(true);
  expect(result.route.escalationCategories).toContain("injury");

  const service = serviceClient();
  const { data: escs } = await service.from("escalations").select("*").eq("client_id", clientId);
  expect(escs).toHaveLength(1);
  expect(escs![0]!.status).toBe("open");
  expect(escs![0]!.source).toBe("keyword");

  // A clearly-automated SYSTEM holding line landed in the thread.
  const { data: system } = await service
    .from("messages")
    .select("sender, kind, body, payload")
    .eq("client_id", clientId)
    .eq("sender", "system");
  expect(system!.some((m) => m.body?.includes("Rae") && (m.payload as { escalation?: boolean }).escalation)).toBe(true);

  const { data: events } = await service
    .from("events")
    .select("type")
    .eq("client_id", clientId)
    .eq("type", "escalation_raised");
  expect(events!.length).toBe(1);
});

test("a self-harm signal additionally surfaces the crisis-resources card", async () => {
  const { orgId, clientId } = await seed();
  const text = "sometimes I feel like I want to die";
  const messageId = await seedMessage(orgId, clientId, text);

  const result = await handleClientMessage(serviceClient(), { orgId, clientId, messageId, text }, { classify: throwingClassify });
  expect(result.escalated).toBe(true);
  expect(result.route.selfHarm).toBe(true);

  const { data: cards } = await serviceClient()
    .from("messages")
    .select("kind, payload, body")
    .eq("client_id", clientId)
    .eq("kind", "card");
  expect(cards).toHaveLength(1);
  expect((cards![0]!.payload as { crisis?: boolean }).crisis).toBe(true);
  // Supportive, non-clinical — and never a made-up specific hotline number.
  expect(cards![0]!.body).not.toMatch(/\b\d{3}[-.\s]?\d{3,4}\b/);
});

test("a plan-change request escalates with the plan_change flag", async () => {
  const { orgId, clientId } = await seed();
  const text = "can you switch me to 3 days a week?";
  const messageId = await seedMessage(orgId, clientId, text);

  const result = await handleClientMessage(serviceClient(), { orgId, clientId, messageId, text }, { classify: throwingClassify });
  expect(result.escalated).toBe(true);

  const { data: escs } = await serviceClient().from("escalations").select("plan_change").eq("client_id", clientId);
  expect(escs![0]!.plan_change).toBe(true);
});

test("a routine message does NOT escalate — no queue item, no holding line", async () => {
  const { orgId, clientId } = await seed();
  const text = "what's my lunch today?";
  const messageId = await seedMessage(orgId, clientId, text);

  const result = await handleClientMessage(
    serviceClient(),
    { orgId, clientId, messageId, text },
    { classify: async () => ({ category: "routine_autonomous", confidence: 0.95, selfHarm: false }) },
  );
  expect(result.escalated).toBe(false);

  const service = serviceClient();
  expect((await service.from("escalations").select("id").eq("client_id", clientId)).data).toHaveLength(0);
  expect((await service.from("messages").select("id").eq("client_id", clientId).eq("sender", "system")).data).toHaveLength(0);
});
