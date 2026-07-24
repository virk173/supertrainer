import { expect, test } from "@playwright/test";

import { expectAxeAAClean, expectNoHorizontalOverflow, settlePaint } from "./axe";
import { seedTrainer, serviceClient, uniqueEmail } from "./helpers";

const DESKTOP = { width: 1280, height: 800 };
const SHOTS = "test-results/trainer-queue";

async function seedClient(orgId: string, name: string): Promise<string> {
  const service = serviceClient();
  const { data } = await service
    .from("clients")
    .insert({ org_id: orgId, source: "invite", status: "active", intake: { name } })
    .select("id")
    .single();
  return data!.id as string;
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("trainer queue: tabs, URL state, keyboard, approve, a11y", async ({ page }) => {
  const { orgId, tokenHash } = await seedTrainer(uniqueEmail("queue-trainer"));
  const service = serviceClient();

  const ava = await seedClient(orgId, "Ava Reyes");
  const ben = await seedClient(orgId, "Ben Okafor");
  const chloe = await seedClient(orgId, "Chloe Tan");

  await service.from("drafts").insert({
    org_id: orgId,
    client_id: ava,
    category: "conversational",
    draft_text: "Great work this week — keep the protein up and you're on track.",
    status: "pending",
  });
  await service.from("plans").insert({
    org_id: orgId,
    client_id: ben,
    status: "draft",
    source: "onboarding",
    content: {},
    day_types: [],
  });
  await service.from("escalations").insert({
    org_id: orgId,
    client_id: chloe,
    categories: ["pain"],
    self_harm: false,
    source: "keyword",
    status: "open",
  });

  await page.setViewportSize(DESKTOP);
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/trainer/queue`);
  await expect(page.getByTestId("queue-home")).toBeVisible();

  // All three streams present; the list has 3 rows.
  await expect(page.getByTestId("queue-row")).toHaveCount(3);

  // a11y on the quiescent fresh load (before interactions), light + dark.
  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
  await expectAxeAAClean(page);
  await page.screenshot({ path: `${SHOTS}/queue-desktop-light.png`, fullPage: true });

  // Dark: reload with the OS in dark so the page renders dark from first paint
  // (a fresh render axe reads reliably — a mid-flight class toggle does not).
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.getByTestId("queue-home")).toBeVisible();
  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
  await expectAxeAAClean(page);
  await page.screenshot({ path: `${SHOTS}/queue-desktop-dark.png`, fullPage: true });
  await page.emulateMedia({ colorScheme: "light" });
  await page.reload();
  await expect(page.getByTestId("queue-home")).toBeVisible();

  // Tabs with counts; URL state on the Replies tab.
  await page.getByRole("link", { name: /Replies/ }).click();
  await expect(page).toHaveURL(/tab=replies/);
  await expect(page.getByTestId("queue-row")).toHaveCount(1);
  await expect(page.getByTestId("queue-list").getByText("Ava Reyes")).toBeVisible();

  // Reply detail: the editor + approve are inline.
  await page.getByTestId("queue-row").first().click();
  await expect(page.getByTestId("reply-editor")).toBeVisible();

  // Keyboard: back to All, j moves the selection.
  await page.getByRole("link", { name: /^All/ }).click();
  await expect(page.getByTestId("queue-row")).toHaveCount(3);
  await page.getByTestId("queue-row").first().click();
  await page.keyboard.press("j");
  await expect(page.getByTestId("queue-row").nth(1)).toHaveAttribute("aria-current", "true");

  // Approve a reply optimistically (from the Replies tab).
  await page.getByRole("link", { name: /Replies/ }).click();
  await page.getByTestId("queue-row").first().click();
  await page.getByTestId("reply-approve").click();
  await expect(page.getByTestId("cleared-count")).toBeVisible();
});
