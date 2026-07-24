import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { dispatchClientMessage } from "@/lib/comms/dispatch";
import { approveDraft, dismissDraft, editDraft } from "@/lib/comms/queue";
import { tzDate } from "@/lib/ledger/tz";
import type { RoutingClassification } from "@supertrainer/ai";

import { serviceClient, uniqueEmail } from "./helpers";

// Phase 6.4 — the lane dispatcher + queue actions, DB-backed with injected agents
// (no model). Proves: routine → an assistant answer whose numbers are
// code-computed; conversational/plan-impact → a queued draft; escalation → the
// 6.3 path; and the queue mutations (approve sends as coach, edit captures the
// draft_edits reply diff, dismiss drops it).

const NOW = new Date("2026-07-23T12:00:00Z");

async function seed(withPlan = false): Promise<{ orgId: string; clientId: string }> {
  const service = serviceClient();
  const { data: user } = await service.auth.admin.createUser({ email: uniqueEmail("disp"), email_confirm: true });
  const { data: org } = await service
    .from("orgs")
    .insert({ name: "Coach Jo", slug: `disp-${randomUUID().slice(0, 8)}` })
    .select("id")
    .single();
  await service.from("profiles").insert({ id: user!.user!.id, org_id: org!.id, role: "client", display_name: "Kai" });
  const { data: client } = await service
    .from("clients")
    .insert({ org_id: org!.id, profile_id: user!.user!.id, status: "active", source: "invite" })
    .select("id")
    .single();

  if (withPlan) {
    const schedule = Object.fromEntries(Array.from({ length: 7 }, (_, d) => [String(d), "standard"]));
    await service.from("plans_active").insert({
      client_id: client!.id,
      org_id: org!.id,
      targets: { standard: { kcal: 2200, protein_g: 180, carbs_g: 200, fat_g: 70 } },
      schedule,
      meal_slots: ["breakfast", "lunch", "dinner"],
    });
    await service.from("meal_logs").insert({
      org_id: org!.id,
      client_id: client!.id,
      tz_date: tzDate("UTC", NOW),
      meal_slot: "lunch",
      items: [],
      totals: { kcal: 1400, protein: 120, carbs: 130, fat: 40 },
      method: "text",
      confirmed: true,
    });
  }
  return { orgId: org!.id, clientId: client!.id };
}

async function clientMessage(orgId: string, clientId: string, body: string): Promise<string> {
  const { data } = await serviceClient()
    .from("messages")
    .insert({ org_id: orgId, client_id: clientId, sender: "client", kind: "text", body })
    .select("id")
    .single();
  return data!.id;
}

const classifyAs = (category: RoutingClassification["category"]) => async (): Promise<RoutingClassification> => ({
  category,
  confidence: 0.95,
  selfHarm: false,
});

test("routine_autonomous → an instant assistant answer with CODE-computed numbers", async () => {
  const { orgId, clientId } = await seed(true);
  const messageId = await clientMessage(orgId, clientId, "how many carbs do I have left today?");

  const result = await dispatchClientMessage(
    serviceClient(),
    { orgId, clientId, messageId, text: "how many carbs do I have left today?" },
    {
      classify: classifyAs("routine_autonomous"),
      wrap: async ({ fact }) => fact, // grounded (echoes the coded fact)
      now: NOW,
    },
  );
  expect(result.lane).toBe("autonomous");

  const { data: msgs } = await serviceClient()
    .from("messages")
    .select("sender, body, payload")
    .eq("client_id", clientId)
    .eq("sender", "assistant");
  expect(msgs).toHaveLength(1);
  // remaining carbs = 200 target − 130 logged = 70 — computed in code.
  expect(msgs![0]!.body).toContain("carbs 70g");
  expect((msgs![0]!.payload as { autonomous?: boolean }).autonomous).toBe(true);
});

test("conversational → a queued draft in the trainer's voice (injected drafter)", async () => {
  const { orgId, clientId } = await seed();
  const messageId = await clientMessage(orgId, clientId, "how do you stay motivated on weekends?");

  const result = await dispatchClientMessage(
    serviceClient(),
    { orgId, clientId, messageId, text: "how do you stay motivated on weekends?" },
    { classify: classifyAs("conversational"), draft: async () => "Weekends are where consistency is won — plan one anchor meal!", now: NOW },
  );
  expect(result.lane).toBe("draft");

  const { data: drafts } = await serviceClient().from("drafts").select("category, draft_text, status").eq("client_id", clientId);
  expect(drafts).toHaveLength(1);
  expect(drafts![0]!.category).toBe("conversational");
  expect(drafts![0]!.status).toBe("pending");
  expect(drafts![0]!.draft_text).toContain("consistency");
});

test("plan_impact → a queued draft tagged plan_impact", async () => {
  const { orgId, clientId } = await seed(true);
  const messageId = await clientMessage(orgId, clientId, "can I eat out tonight?");
  const result = await dispatchClientMessage(
    serviceClient(),
    { orgId, clientId, messageId, text: "can I eat out tonight?" },
    { classify: classifyAs("plan_impact"), draft: async () => "You've got room — keep it protein-forward.", now: NOW },
  );
  expect(result.lane).toBe("draft");
  const { data: drafts } = await serviceClient().from("drafts").select("category").eq("client_id", clientId);
  expect(drafts![0]!.category).toBe("plan_impact");
});

test("escalation keyword → the 6.3 escalation lane (classifier down)", async () => {
  const { orgId, clientId } = await seed();
  const text = "my knee is in a lot of pain after squats";
  const messageId = await clientMessage(orgId, clientId, text);
  const result = await dispatchClientMessage(
    serviceClient(),
    { orgId, clientId, messageId, text },
    { classify: async () => { throw new Error("down"); }, now: NOW },
  );
  expect(result.lane).toBe("escalation");
  expect((await serviceClient().from("escalations").select("id").eq("client_id", clientId)).data).toHaveLength(1);
});

test("queue: approve sends the draft as the coach; edit captures the reply diff", async () => {
  const { orgId, clientId } = await seed();
  const service = serviceClient();
  const { data: d1 } = await service
    .from("drafts")
    .insert({ org_id: orgId, client_id: clientId, category: "conversational", draft_text: "Original draft." })
    .select("id")
    .single();

  // Approve → a coach message with the draft text + the draft marked approved.
  expect((await approveDraft(service, orgId, d1!.id)).ok).toBe(true);
  const { data: coachMsgs } = await service.from("messages").select("body").eq("client_id", clientId).eq("sender", "coach");
  expect(coachMsgs!.some((m) => m.body === "Original draft.")).toBe(true);
  expect((await service.from("drafts").select("status").eq("id", d1!.id)).data![0]!.status).toBe("approved");

  // Edit a second draft → the edited text is sent AND a draft_edits reply row lands.
  const { data: d2 } = await service
    .from("drafts")
    .insert({ org_id: orgId, client_id: clientId, category: "conversational", draft_text: "Draft two." })
    .select("id")
    .single();
  expect((await editDraft(service, orgId, d2!.id, "My better wording.")).ok).toBe(true);
  const { data: coach2 } = await service.from("messages").select("body").eq("client_id", clientId).eq("sender", "coach");
  expect(coach2!.some((m) => m.body === "My better wording.")).toBe(true);
  const { data: edits } = await service.from("draft_edits").select("entity_type, before, after").eq("entity_id", d2!.id);
  expect(edits).toHaveLength(1);
  expect(edits![0]!.entity_type).toBe("reply");
  expect(edits![0]!.after).toBe("My better wording.");
  expect((await service.from("drafts").select("status").eq("id", d2!.id)).data![0]!.status).toBe("edited");

  // Dismiss a third → no coach message, status dismissed.
  const { data: d3 } = await service
    .from("drafts")
    .insert({ org_id: orgId, client_id: clientId, category: "conversational", draft_text: "Nope." })
    .select("id")
    .single();
  expect((await dismissDraft(service, orgId, d3!.id)).ok).toBe(true);
  expect((await service.from("drafts").select("status").eq("id", d3!.id)).data![0]!.status).toBe("dismissed");
  expect((await service.from("messages").select("id").eq("client_id", clientId).eq("body", "Nope.")).data).toHaveLength(0);
});
