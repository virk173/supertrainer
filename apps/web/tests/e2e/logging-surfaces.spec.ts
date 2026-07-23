import { expect, test } from "@playwright/test";

import { resolveCheckinStatus, toKg, fromKg } from "../../lib/ledger/checkin";
import {
  hasWorkoutSets,
  upsertCheckin,
  upsertWeighIn,
  upsertWearable,
  upsertWorkoutSets,
  type SurfaceCtx,
} from "../../lib/ledger/surfaces-core";
import { consentClient, seedClient, serviceClient, uniqueEmail } from "./helpers";

const DAY = "2026-06-15";

async function seedCtx(prefix: string): Promise<{ ctx: SurfaceCtx; userId: string; tokenHash: string }> {
  const { userId, orgId, tokenHash } = await seedClient(uniqueEmail(prefix));
  const service = serviceClient();
  const { data: client } = await service.from("clients").select("id").eq("profile_id", userId).single();
  return { ctx: { orgId, clientId: client!.id, tzDate: DAY }, userId, tokenHash };
}

// Pure rules — check-in auto-satisfy + kg/lb normalization.
test("check-in auto-satisfy + weight conversion are pure and correct", () => {
  expect(resolveCheckinStatus("rest", false)).toBe("rest");
  expect(resolveCheckinStatus("missed", false)).toBe("missed");
  expect(resolveCheckinStatus(null, false)).toBe("missed");
  expect(resolveCheckinStatus("rest", true)).toBe("trained"); // sets logged -> trained
  expect(toKg(100, "lb")).toBeCloseTo(45.36, 1);
  expect(toKg(70, "kg")).toBe(70);
  expect(fromKg(45.36, "lb")).toBeCloseTo(100, 0);
});

// The offline queue's correctness rests on idempotent upserts: replaying a write
// must never duplicate. Plus the check-in auto-satisfies once sets exist.
test("surface writes are idempotent (offline-replay safe) and auto-satisfy the check-in", async () => {
  const service = serviceClient();
  const { ctx } = await seedCtx("surfaces");

  // Weigh-in twice (a replayed offline write) -> one row.
  await upsertWeighIn(service, ctx, { weightKg: 72.5, method: "manual" });
  await upsertWeighIn(service, ctx, { weightKg: 72.5, method: "manual" });
  const weighs = await service.from("weigh_ins").select("id").eq("client_id", ctx.clientId).eq("tz_date", DAY);
  expect(weighs.data?.length).toBe(1);

  // Check-in 'rest' before any sets.
  expect(await upsertCheckin(service, ctx, "rest")).toBe("rest");
  expect(await hasWorkoutSets(service, ctx.clientId, DAY)).toBe(false);

  // Logging sets auto-satisfies the check-in to 'trained'...
  await upsertWorkoutSets(service, ctx, [
    { exerciseId: "bench", exerciseName: "Bench Press", setNumber: 1, weightKg: 60, reps: 8 },
    { exerciseId: "bench", exerciseName: "Bench Press", setNumber: 2, weightKg: 60, reps: 8 },
  ]);
  expect(await hasWorkoutSets(service, ctx.clientId, DAY)).toBe(true);
  const c1 = await service.from("gym_checkins").select("status").eq("client_id", ctx.clientId).eq("tz_date", DAY).single();
  expect(c1.data?.status).toBe("trained");

  // ...and a later 'rest' tap can't undo a day you actually trained.
  expect(await upsertCheckin(service, ctx, "rest")).toBe("trained");

  // Replaying the same sets -> still 2 rows, not 4.
  await upsertWorkoutSets(service, ctx, [
    { exerciseId: "bench", exerciseName: "Bench Press", setNumber: 1, weightKg: 60, reps: 8 },
    { exerciseId: "bench", exerciseName: "Bench Press", setNumber: 2, weightKg: 60, reps: 8 },
  ]);
  const sets = await service.from("workout_logs").select("id").eq("client_id", ctx.clientId).eq("tz_date", DAY);
  expect(sets.data?.length).toBe(2);

  // Steps/sleep idempotent too.
  await upsertWearable(service, ctx, { steps: 8000, sleepMin: 420 });
  await upsertWearable(service, ctx, { steps: 8200, sleepMin: 430 });
  const wear = await service.from("wearable_daily").select("steps").eq("client_id", ctx.clientId).eq("tz_date", DAY);
  expect(wear.data?.length).toBe(1);
  expect(wear.data?.[0]?.steps).toBe(8200); // last write wins
});

test("portal: daily quick-log + workout + progress surfaces render for a client (mobile)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const { userId, tokenHash } = await seedCtx("surfaces-ui");
  await consentClient(userId);
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/portal`);

  await expect(page.getByTestId("daily-log")).toBeVisible();
  await expect(page.getByTestId("weigh-input")).toBeVisible();
  await expect(page.getByTestId("checkin-trained")).toBeVisible();
  await expect(page.getByTestId("steps-input")).toBeVisible();

  await page.getByTestId("workout-cta").click();
  await expect(page.getByTestId("workout-logger")).toBeVisible();

  await page.goto("/portal/progress");
  await expect(page.getByTestId("progress-photos")).toBeVisible();
  await expect(page.getByTestId("progress-front")).toBeVisible();

  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(noOverflow).toBe(true);
});
