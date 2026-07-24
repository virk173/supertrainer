import { expect, test } from "@playwright/test";

import { expectAxeAAClean, expectNoHorizontalOverflow, settlePaint } from "./axe";
import { seedTrainer, serviceClient, uniqueEmail } from "./helpers";

const DESKTOP = { width: 1280, height: 800 };
const SHOTS = "test-results/trainer-home";

function dayStr(offset: number): string {
  return new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
}

const CLEAN_MISS = {
  mealSlots: [],
  meals: 0,
  weighIn: false,
  checkin: false,
  sets: false,
  total: 0,
};
const HEAVY_MISS = {
  mealSlots: [],
  meals: 2,
  weighIn: true,
  checkin: false,
  sets: true,
  total: 4,
};
const EXPECTED = {
  mode: "generic",
  mealSlots: [],
  minMeals: 2,
  weighIn: true,
  checkin: false,
  sets: true,
};

// Seed one active client with a ledger history. `missy` misses everything;
// `gap` skips the most-recent N days (a logging gap the at-risk radar catches).
async function seedActiveClient(
  orgId: string,
  name: string,
  opts: { days: number; missy?: boolean; gap?: number },
): Promise<string> {
  const service = serviceClient();
  const { data: client } = await service
    .from("clients")
    .insert({ org_id: orgId, source: "invite", status: "active", intake: { name } })
    .select("id")
    .single();
  const id = client!.id as string;
  const start = opts.gap ?? 0;
  const rows = [];
  for (let i = start; i < start + opts.days; i++) {
    rows.push({
      org_id: orgId,
      client_id: id,
      tz_date: dayStr(i),
      expected: EXPECTED,
      misses: opts.missy ? HEAVY_MISS : CLEAN_MISS,
    });
  }
  await service.from("ledger_days").insert(rows);
  return id;
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("trainer home: morning digest renders KPIs, needs-you list, on-track grid", async ({
  page,
}) => {
  const { orgId, tokenHash } = await seedTrainer(uniqueEmail("home-trainer"));
  const service = serviceClient();

  // 5 on-track, 2 slipping (one with a logging gap).
  await seedActiveClient(orgId, "Ava Reyes", { days: 10 });
  await seedActiveClient(orgId, "Ben Okafor", { days: 10 });
  const chloe = await seedActiveClient(orgId, "Chloe Tan", { days: 10 });
  await seedActiveClient(orgId, "Diego Silva", { days: 10 });
  await seedActiveClient(orgId, "Priya Nair", { days: 10 });
  const marcus = await seedActiveClient(orgId, "Marcus Bell", { days: 6, missy: true, gap: 5 });
  await seedActiveClient(orgId, "Sara Lund", { days: 10, missy: true });

  // A pending reply, an open escalation, and a renewal due.
  const [{ data: ava }, { data: ben }] = await Promise.all([
    service.from("clients").select("id").eq("org_id", orgId).eq("intake->>name", "Ava Reyes").single(),
    service.from("clients").select("id").eq("org_id", orgId).eq("intake->>name", "Ben Okafor").single(),
  ]);
  await service.from("drafts").insert({
    org_id: orgId,
    client_id: ava!.id,
    category: "conversational",
    draft_text: "Great work this week — keep the protein up and you're on track.",
    status: "pending",
  });
  await service.from("escalations").insert({
    org_id: orgId,
    client_id: chloe,
    categories: ["pain"],
    self_harm: false,
    source: "keyword",
    status: "open",
  });
  await service.from("plan_requests").insert({
    org_id: orgId,
    client_id: ben!.id,
    kind: "diet",
    trigger: "monthly",
    status: "queued",
  });
  void marcus;

  await page.setViewportSize(DESKTOP);
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/trainer`);
  await expect(page.getByTestId("trainer-home")).toBeVisible();

  // KPI row: 7 active clients.
  await expect(page.getByText("Active clients")).toBeVisible();
  await expect(page.getByText("7", { exact: true }).first()).toBeVisible();

  // Needs you today: heading, the escalation (by its reason), a reply group, an
  // at-risk row (Chloe is also in the on-track grid, so assert the unique reason).
  await expect(page.getByRole("heading", { name: "Needs you today" })).toBeVisible();
  await expect(page.getByText("Pain or injury mentioned")).toBeVisible();
  await expect(page.getByText("Replies to approve")).toBeVisible();
  await expect(page.getByText("Logging stopped", { exact: false })).toBeVisible();
  await expect(page.getByTestId("clear-estimate")).toBeVisible();

  // On-track grid (collapsed) present.
  await expect(page.getByText(/On track/)).toBeVisible();

  // Let hydration + the realtime subscription settle before axe reads colors
  // (an in-flight repaint makes axe misresolve the oklch→lab card backgrounds).
  await page.waitForLoadState("networkidle");
  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
  await expectAxeAAClean(page);
  await page.screenshot({ path: `${SHOTS}/home-desktop-light.png`, fullPage: true });

  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
  await expectAxeAAClean(page);
  await page.screenshot({ path: `${SHOTS}/home-desktop-dark.png`, fullPage: true });
});
