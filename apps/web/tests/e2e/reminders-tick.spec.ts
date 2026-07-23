import { expect, test } from "@playwright/test";

import { runReminderTick } from "../../lib/reminders/tick";
import { seedClient, serviceClient, uniqueEmail } from "./helpers";

// Phase 3.6 — the reminder tick (integration). The decision rules are unit-
// covered in reminders.spec.ts; here we prove the tick reads a client's rules +
// logs, enqueues a notification, mirrors the prompt into the thread, is
// idempotent, and honors suppression + quiet hours.

const DAY = "2026-06-15";
const NOON = new Date("2026-06-15T12:30:00Z"); // UTC profile -> local 12:30
const NIGHT = new Date("2026-06-15T22:30:00Z"); // local 22:30 (quiet)

async function seedWithRule(prefix: string, times: string[]) {
  const service = serviceClient();
  const { userId, orgId } = await seedClient(uniqueEmail(prefix));
  const { data: client } = await service.from("clients").select("id").eq("profile_id", userId).single();
  await service.from("reminder_rules").insert({
    org_id: orgId, client_id: client!.id, kind: "meal", enabled: true, schedule: { times },
  });
  return { service, orgId, clientId: client!.id };
}

test("tick enqueues a due, unsatisfied meal reminder and mirrors it to the thread", async () => {
  const { service, clientId } = await seedWithRule("rem-due", ["12:00"]);
  await runReminderTick(service, NOON, { clientIds: [clientId] });

  const notifs = await service.from("notifications").select("kind, status, channel").eq("client_id", clientId);
  expect(notifs.data?.length).toBe(1);
  expect(notifs.data?.[0]?.status).toBe("queued");

  const msgs = await service.from("messages").select("kind, sender, body").eq("client_id", clientId).eq("kind", "reminder");
  expect(msgs.data?.length).toBe(1);
  expect(msgs.data?.[0]?.sender).toBe("system");
  expect((msgs.data?.[0]?.body ?? "").length).toBeGreaterThan(0);
});

test("tick suppresses a reminder for an already-logged meal", async () => {
  const { service, orgId, clientId } = await seedWithRule("rem-logged", ["12:00"]);
  await service.from("meal_logs").insert({
    org_id: orgId, client_id: clientId, tz_date: DAY, meal_slot: "lunch", method: "text", items: [], totals: {},
  });
  await runReminderTick(service, NOON, { clientIds: [clientId] });
  const notifs = await service.from("notifications").select("id").eq("client_id", clientId);
  expect(notifs.data?.length).toBe(0);
});

test("tick defers during quiet hours (nothing enqueued)", async () => {
  const { service, clientId } = await seedWithRule("rem-quiet", ["22:00"]);
  await runReminderTick(service, NIGHT, { clientIds: [clientId] });
  const notifs = await service.from("notifications").select("id").eq("client_id", clientId);
  expect(notifs.data?.length).toBe(0);
});

test("tick is idempotent — a second run double-enqueues neither the notification nor the thread message", async () => {
  const { service, clientId } = await seedWithRule("rem-idem", ["12:00"]);
  await runReminderTick(service, NOON, { clientIds: [clientId] });
  await runReminderTick(service, NOON, { clientIds: [clientId] });
  const notifs = await service.from("notifications").select("id").eq("client_id", clientId);
  expect(notifs.data?.length).toBe(1);
  // The thread mirror must also be de-duped (was posted unconditionally before).
  const msgs = await service.from("messages").select("id").eq("client_id", clientId).eq("kind", "reminder");
  expect(msgs.data?.length).toBe(1);
});

test("regression: a weigh-in scheduled by weekday NAME fires (names were compared to numeric weekday)", async () => {
  const service = serviceClient();
  const { userId, orgId } = await seedClient(uniqueEmail("rem-weekday"));
  const { data: client } = await service.from("clients").select("id").eq("profile_id", userId).single();
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const todayName = names[new Date(`${DAY}T12:00:00Z`).getUTCDay()];
  await service.from("reminder_rules").insert({
    org_id: orgId, client_id: client!.id, kind: "weigh_in", enabled: true,
    schedule: { days: [todayName], time: "07:00" },
  });
  await runReminderTick(service, NOON, { clientIds: [client!.id] });
  const notifs = await service.from("notifications").select("kind").eq("client_id", client!.id);
  expect(notifs.data?.some((n) => n.kind === "weigh_in")).toBe(true);
});

test("regression: an un-padded schedule time ('8:00') fires (string compare needs HH:MM)", async () => {
  const { service, clientId } = await seedWithRule("rem-pad", ["8:00"]);
  await runReminderTick(service, NOON, { clientIds: [clientId] }); // local 12:30
  const notifs = await service.from("notifications").select("kind").eq("client_id", clientId);
  expect(notifs.data?.length).toBe(1);
});

test("a disabled rule (vacation mode) enqueues nothing", async () => {
  const { service, clientId } = await seedWithRule("rem-vacation", ["12:00"]);
  await service.from("reminder_rules").update({ enabled: false }).eq("client_id", clientId);
  await runReminderTick(service, NOON, { clientIds: [clientId] });
  const notifs = await service.from("notifications").select("id").eq("client_id", clientId);
  expect(notifs.data?.length).toBe(0);
});
