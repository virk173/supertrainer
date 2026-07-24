import { expect, test } from "@playwright/test";

import { expectAxeAAClean, expectNoHorizontalOverflow, settlePaint } from "./axe";
import { seedTrainer, serviceClient, uniqueEmail } from "./helpers";

const DESKTOP = { width: 1280, height: 900 };
const SHOTS = "test-results/trainer-inbox";

function dayStr(offset: number): string {
  return new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("trainer inbox: thread + context + to-dos, approve drafted reply, a11y", async ({
  page,
}) => {
  const { orgId, tokenHash } = await seedTrainer(uniqueEmail("inbox-trainer"));
  const service = serviceClient();

  const { data: client } = await service
    .from("clients")
    .insert({
      org_id: orgId,
      source: "invite",
      status: "active",
      consent_signed_at: new Date().toISOString(),
      intake: { name: "Ava Reyes", timezone: "UTC" },
    })
    .select("id")
    .single();
  const id = client!.id as string;

  // Clean ledger (high adherence) over 10 days.
  await service.from("ledger_days").insert(
    Array.from({ length: 10 }, (_, i) => ({
      org_id: orgId,
      client_id: id,
      tz_date: dayStr(i),
      expected: { mode: "generic", mealSlots: [], minMeals: 2, weighIn: true, checkin: false, sets: true },
      misses: { mealSlots: [], meals: 0, weighIn: false, checkin: false, sets: false, total: 0 },
    })),
  );

  // Weight trend (down 1.2 kg) + an active plan with a fasting window.
  await service.from("weigh_ins").insert([
    { org_id: orgId, client_id: id, tz_date: dayStr(0), weight_kg: 72.4 },
    { org_id: orgId, client_id: id, tz_date: dayStr(21), weight_kg: 73.6 },
  ]);
  const everyDayTraining = Object.fromEntries(
    Array.from({ length: 7 }, (_, d) => [String(d), "training"]),
  );
  await service.from("plans_active").insert({
    client_id: id,
    org_id: orgId,
    day_types: [{ name: "training", kcal: 2200, protein_g: 160, carbs_g: 220, fat_g: 60 }],
    schedule: everyDayTraining,
    meal_slots: ["breakfast", "lunch", "dinner"],
    targets: {},
    fast_window: { start: "12:00", end: "20:00" },
  });

  // A thread with history + a pending drafted reply.
  await service.from("messages").insert([
    { org_id: orgId, client_id: id, sender: "client", kind: "text", body: "Can I have a cheat meal this weekend?" },
    { org_id: orgId, client_id: id, sender: "coach", kind: "text", body: "Let's plan it around your training day." },
  ]);
  await service.from("drafts").insert({
    org_id: orgId,
    client_id: id,
    category: "conversational",
    draft_text: "One planned meal is totally fine — keep the protein high and enjoy it.",
    status: "pending",
  });

  await page.setViewportSize(DESKTOP);
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/trainer/clients/${id}/inbox`);
  await expect(page.getByTestId("inbox-title")).toBeVisible();

  // Three panes present.
  await expect(page.getByTestId("chat-thread")).toBeVisible();
  await expect(page.getByTestId("client-context")).toBeVisible();
  await expect(page.getByTestId("todo-tracker")).toBeVisible();
  await expect(page.getByTestId("fast-window")).toBeVisible();
  await expect(page.getByTestId("client-context").getByText("72.4")).toBeVisible();

  // The drafted reply is surfaced above the composer; approving it sends it.
  await expect(page.getByTestId("drafted-reply-card")).toBeVisible();
  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
  await expectAxeAAClean(page);
  await page.screenshot({ path: `${SHOTS}/inbox-desktop-light.png`, fullPage: true });

  await page.getByTestId("drafted-reply-approve").click();
  await expect(page.getByTestId("drafted-reply-card")).toBeHidden();

  // Dark, fresh render.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.getByTestId("inbox-title")).toBeVisible();
  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
  await expectAxeAAClean(page);
  await page.screenshot({ path: `${SHOTS}/inbox-desktop-dark.png`, fullPage: true });

  // Mobile: panes collapse to tabs (thread default); switching shows the context.
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await expect(page.getByTestId("inbox-title")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Thread" })).toBeVisible();
  await page.getByRole("tab", { name: "Client" }).click();
  await expect(page.getByTestId("client-context")).toBeVisible();
  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
  await expectAxeAAClean(page);
  await page.screenshot({ path: `${SHOTS}/inbox-mobile-light.png` });
});
