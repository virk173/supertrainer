import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { recordCardAnswer } from "@/lib/cards/answer";
import { runMorningDigestTick } from "@/lib/cards/digest-tick";
import { runWeeklyRecapTick } from "@/lib/cards/recap-tick";
import { runCardTick } from "@/lib/cards/tick";

import { serviceClient, uniqueEmail } from "./helpers";

// Phase 6.5 — the card/recap/digest ticks + answer capture, DB-backed. The picker
// math is fixtured in cards-picker.spec; here the tick actually delivers, respects
// the 1/day cap, records tap-answers, and assembles the morning digest.

async function seedClient(): Promise<{ orgId: string; clientId: string }> {
  const service = serviceClient();
  const { data: user } = await service.auth.admin.createUser({ email: uniqueEmail("card"), email_confirm: true });
  const { data: org } = await service
    .from("orgs")
    .insert({ name: "Coach Lee", slug: `card-${randomUUID().slice(0, 8)}` })
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

const NOON_THU = new Date("2026-07-23T12:00:00Z"); // outside the default quiet window
const SUNDAY = new Date("2026-07-26T18:00:00Z");

test("card tick delivers one gap-filling card, then honours the 1/day cap", async () => {
  const { clientId } = await seedClient();
  const service = serviceClient();

  // A non-logger (no meals/weigh-ins) → the questionnaire card.
  const r1 = await runCardTick(service, NOON_THU, { clientIds: [clientId] });
  expect(r1.delivered).toBe(1);
  const { data: cards } = await service.from("messages").select("kind, payload").eq("client_id", clientId).eq("kind", "card");
  expect(cards).toHaveLength(1);
  expect((cards![0]!.payload as { check_in?: boolean; card_kind?: string }).check_in).toBe(true);
  expect((cards![0]!.payload as { card_kind?: string }).card_kind).toBe("questionnaire");

  // A second run the same day delivers nothing (cap).
  const r2 = await runCardTick(service, NOON_THU, { clientIds: [clientId] });
  expect(r2.delivered).toBe(0);
});

test("a card answer is recorded to check_in_responses (verified against the message)", async () => {
  const { orgId, clientId } = await seedClient();
  const service = serviceClient();
  const { data: card } = await service
    .from("messages")
    .insert({
      org_id: orgId,
      client_id: clientId,
      sender: "system",
      kind: "card",
      body: "How did you sleep?",
      payload: { check_in: true, card_id: "sleep-1", card_version: 1, card_kind: "sleep", answer_type: "scale" },
    })
    .select("id")
    .single();

  const ok = await recordCardAnswer(service, { clientId, messageId: card!.id, answer: { value: 4 } });
  expect(ok.ok).toBe(true);
  const { data: resp } = await service.from("check_in_responses").select("card_kind, answer").eq("client_id", clientId);
  expect(resp).toHaveLength(1);
  expect(resp![0]!.card_kind).toBe("sleep");
  expect((resp![0]!.answer as { value?: number }).value).toBe(4);

  // A message that isn't this client's card is rejected (tenancy).
  const other = await seedClient();
  const rej = await recordCardAnswer(service, { clientId: other.clientId, messageId: card!.id, answer: { value: 1 } });
  expect(rej.ok).toBe(false);
});

test("weekly recap tick delivers an assistant recap card on Sunday, once", async () => {
  const { orgId, clientId } = await seedClient();
  const service = serviceClient();
  await service.from("ledger_days").insert({
    org_id: orgId,
    client_id: clientId,
    tz_date: "2026-07-25",
    expected: { mode: "generic", minMeals: 2, weighIn: false, sets: false, checkin: false, mealSlots: [] },
    misses: { meals: 0, mealSlots: [], weighIn: false, sets: false, checkin: false, total: 0 },
    closed_at: new Date().toISOString(),
  });

  const r1 = await runWeeklyRecapTick(service, SUNDAY, { clientIds: [clientId] });
  expect(r1.delivered).toBe(1);
  const { data: recaps } = await service
    .from("messages")
    .select("sender, kind, payload")
    .eq("client_id", clientId)
    .eq("kind", "card");
  expect(recaps).toHaveLength(1);
  expect(recaps![0]!.sender).toBe("assistant");
  expect((recaps![0]!.payload as { recap?: boolean }).recap).toBe(true);

  // Idempotent within the week.
  const r2 = await runWeeklyRecapTick(service, SUNDAY, { clientIds: [clientId] });
  expect(r2.delivered).toBe(0);
});

test("morning digest tick records a per-org digest event with the coded counts", async () => {
  const { orgId, clientId } = await seedClient();
  const service = serviceClient();
  await service.from("drafts").insert({ org_id: orgId, client_id: clientId, category: "conversational", draft_text: "pending!" });

  const r = await runMorningDigestTick(service, NOON_THU, { orgIds: [orgId] });
  expect(r.orgs).toBe(1);
  const { data: events } = await service.from("events").select("type, payload").eq("org_id", orgId).eq("type", "morning_digest");
  expect(events).toHaveLength(1);
  expect((events![0]!.payload as { pendingDrafts?: number }).pendingDrafts).toBe(1);
});
