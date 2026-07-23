import { expect, test } from "@playwright/test";

import { closeDueDays, recomputeDay } from "../../lib/ledger/day-close-job";
import { seedClient, serviceClient, uniqueEmail } from "./helpers";

// Phase 3.4 — the close job wiring (integration). The pure engine is covered in
// day-close.spec.ts; here we prove the job gathers a day's real logs, evaluates
// them, and writes an auto-miss ledger_days row (never blank) — idempotently —
// and that a back-dated log reopens the day as `late`.

const DAY = "2026-06-10";
// Profile timezone defaults to UTC, so the client's local date == the UTC date.
// 2026-06-11 02:00 UTC means 2026-06-10 has ended.
const NOW = new Date("2026-06-11T02:00:00Z");

async function seedActiveClient(prefix: string) {
  const service = serviceClient();
  const { userId, orgId } = await seedClient(uniqueEmail(prefix));
  const { data: client } = await service.from("clients").select("id").eq("profile_id", userId).single();
  return { service, orgId, clientId: client!.id };
}

test("close job writes an auto-miss ledger day (generic mode, one meal short)", async () => {
  const { service, orgId, clientId } = await seedActiveClient("dayclose");
  await service.from("meal_logs").insert({
    org_id: orgId, client_id: clientId, tz_date: DAY, meal_slot: "lunch", method: "text", items: [], totals: {},
  });

  await closeDueDays(service, NOW, { clientIds: [clientId], window: 1 });

  const { data: ld } = await service
    .from("ledger_days")
    .select("expected, actual, misses, closed_at")
    .eq("client_id", clientId)
    .eq("tz_date", DAY)
    .single();
  expect(ld?.closed_at).not.toBeNull();
  expect((ld?.expected as { mode: string }).mode).toBe("generic");
  expect((ld?.misses as { meals: number }).meals).toBe(1); // 2 expected, 1 logged
});

test("close job is idempotent — a second run leaves exactly one row", async () => {
  const { service, orgId, clientId } = await seedActiveClient("dayclose-idem");
  await service.from("meal_logs").insert({
    org_id: orgId, client_id: clientId, tz_date: DAY, meal_slot: "lunch", method: "text", items: [], totals: {},
  });
  await closeDueDays(service, NOW, { clientIds: [clientId], window: 1 });
  await closeDueDays(service, NOW, { clientIds: [clientId], window: 1 });
  const { data } = await service.from("ledger_days").select("id").eq("client_id", clientId).eq("tz_date", DAY);
  expect(data?.length).toBe(1);
});

test("a paused client accrues no misses at close", async () => {
  const { service, clientId } = await seedActiveClient("dayclose-paused");
  await service.from("clients").update({ status: "paused" }).eq("id", clientId);
  await closeDueDays(service, NOW, { clientIds: [clientId], window: 1 });
  const { data: ld } = await service
    .from("ledger_days")
    .select("misses")
    .eq("client_id", clientId)
    .eq("tz_date", DAY)
    .maybeSingle();
  // Either no row, or a row with zero misses — never a blanket miss for a paused client.
  if (ld) expect((ld.misses as { total: number }).total).toBe(0);
});

test("recomputeDay reopens a closed day as late and updates misses when a back-dated log lands", async () => {
  const { service, orgId, clientId } = await seedActiveClient("dayclose-late");
  await service.from("meal_logs").insert({
    org_id: orgId, client_id: clientId, tz_date: DAY, meal_slot: "lunch", method: "text", items: [], totals: {},
  });
  await closeDueDays(service, NOW, { clientIds: [clientId], window: 1 });

  // Back-log a second meal for that already-closed day.
  await service.from("meal_logs").insert({
    org_id: orgId, client_id: clientId, tz_date: DAY, meal_slot: "dinner", method: "text", items: [], totals: {},
  });
  const evalv = await recomputeDay(service, clientId, DAY);
  expect(evalv.late).toBe(true);
  expect(evalv.misses.meals).toBe(0); // now 2 meals -> no meal miss

  const { data: ld } = await service
    .from("ledger_days")
    .select("late, misses")
    .eq("client_id", clientId)
    .eq("tz_date", DAY)
    .single();
  expect(ld?.late).toBe(true);
  expect((ld?.misses as { meals: number }).meals).toBe(0);
});
