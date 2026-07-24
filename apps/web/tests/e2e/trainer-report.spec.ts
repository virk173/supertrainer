import { expect, test } from "@playwright/test";

import { seedTrainer, serviceClient, uniqueEmail } from "./helpers";

function dayStr(offset: number): string {
  return new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
}

test("trainer report: the monthly progress PDF generates for a client", async ({ page }) => {
  const { orgId, tokenHash } = await seedTrainer(uniqueEmail("report-trainer"));
  const service = serviceClient();

  const { data: client } = await service
    .from("clients")
    .insert({ org_id: orgId, source: "invite", status: "active", intake: { name: "Ava Reyes" } })
    .select("id")
    .single();
  const id = client!.id as string;

  // Adherence + weight + strength inputs across the month.
  await service.from("ledger_days").insert(
    Array.from({ length: 12 }, (_, i) => ({
      org_id: orgId,
      client_id: id,
      tz_date: dayStr(i),
      expected: { mode: "generic", mealSlots: [], minMeals: 2, weighIn: true, checkin: false, sets: true },
      misses: { mealSlots: [], meals: 0, weighIn: false, checkin: false, sets: false, total: 0 },
    })),
  );
  await service.from("weigh_ins").insert([
    { org_id: orgId, client_id: id, tz_date: dayStr(28), weight_kg: 74.0 },
    { org_id: orgId, client_id: id, tz_date: dayStr(2), weight_kg: 72.2 },
  ]);

  // A real catalog exercise so the workout_logs FK holds + the PR name resolves.
  const { data: exercise } = await service
    .from("exercises")
    .select("id, name")
    .is("org_id", null)
    .limit(1)
    .single();
  const ex = { exercise_id: exercise!.id, exercise_name: exercise!.name };
  await service.from("workout_logs").insert([
    { org_id: orgId, client_id: id, tz_date: dayStr(20), ...ex, set_number: 1, weight_kg: 80, reps: 5 },
    { org_id: orgId, client_id: id, tz_date: dayStr(6), ...ex, set_number: 1, weight_kg: 90, reps: 5 },
  ]);

  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/trainer/clients/${id}`);
  await expect(page.getByTestId("profile-title")).toBeVisible();

  // The report route returns a valid PDF (session cookie carried by the context).
  const res = await page.request.get(`/trainer/clients/${id}/report`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/pdf");
  const body = await res.body();
  expect(body.subarray(0, 5).toString()).toBe("%PDF-");
  expect(body.length).toBeGreaterThan(1000);
});
