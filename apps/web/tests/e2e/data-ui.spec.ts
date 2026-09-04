import { expect, test } from "@playwright/test";

import { expectAxeAAClean, expectNoHorizontalOverflow, settlePaint } from "./axe";
import { consentClient, seedClient, seedTrainer, serviceClient, uniqueEmail } from "./helpers";

// Phase 9.1 — the data-rights surfaces: a trainer exporting or retiring their
// workspace, a client taking their own record with them, and the public page that
// states the promise before anyone signs up.

test("trainer: export builds an archive, deletion schedules with a grace window", async ({ page }) => {
  const { orgId, tokenHash } = await seedTrainer(uniqueEmail("data-trainer"));
  const service = serviceClient();
  await service.from("tiers").insert({ org_id: orgId, name: "Pro", price_cents: 10000, currency: "usd" });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/trainer/settings/data`);
  await expect(page.getByTestId("data-rights")).toBeVisible();

  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
  await expectAxeAAClean(page);

  // The manifest is legible before you export — the promise, itemised.
  await page.getByRole("button", { name: "What’s inside" }).click();
  await expect(page.getByText("clients", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Export everything" }).click();
  await expect(page.getByText("Your archive is ready.")).toBeVisible();
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();

  const { data: job } = await service
    .from("export_jobs")
    .select("status, size_bytes")
    .eq("org_id", orgId)
    .single();
  expect(job?.status).toBe("ready");
  expect(job?.size_bytes ?? 0).toBeGreaterThan(0);

  // Deletion is two steps, and typing the word is one of them.
  await page.getByRole("button", { name: "Request deletion" }).click();
  await page.getByLabel(/Type DELETE/).fill("DELETE");
  await page.getByRole("button", { name: "Schedule deletion" }).click();
  await expect(page.getByText(/days left to change your mind/)).toBeVisible();

  const { data: req } = await service
    .from("deletion_requests")
    .select("status, grace_until, final_export_job_id")
    .eq("org_id", orgId)
    .single();
  expect(req?.status).toBe("pending");
  expect(req?.final_export_job_id).not.toBeNull();
  // Nothing is destroyed today — the window is ~30 days out.
  const days = (new Date(req!.grace_until).getTime() - Date.now()) / 86_400_000;
  expect(days).toBeGreaterThan(29);

  // …and it is reversible.
  await page.getByRole("button", { name: "Cancel deletion" }).click();
  await expect(page.getByText("The deletion is cancelled.")).toBeVisible();
  const { data: after } = await service
    .from("deletion_requests")
    .select("status")
    .eq("org_id", orgId)
    .single();
  expect(after?.status).toBe("canceled");

  // The workspace still stands.
  const { count } = await service
    .from("tiers")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);
  expect(count).toBe(1);

  // Dark, and narrow — the archive ledger is the widest thing on the page.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.getByTestId("data-rights")).toBeVisible();
  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
  await expectAxeAAClean(page);

  for (const width of [768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("button", { name: "What\u2019s inside" }).click();
    await settlePaint(page);
    await expectNoHorizontalOverflow(page);
    await page.getByRole("button", { name: "What\u2019s inside" }).click();
  }
  await expectAxeAAClean(page);
});

test("client: takes their own copy, and asking to be deleted tells the coach", async ({ page }) => {
  const email = uniqueEmail("data-client");
  const { userId, orgId, tokenHash } = await seedClient(email);
  await consentClient(userId);
  const service = serviceClient();
  const { data: client } = await service
    .from("clients")
    .select("id")
    .eq("profile_id", userId)
    .single();
  await service
    .from("weigh_ins")
    .insert({ org_id: orgId, client_id: client!.id, tz_date: "2026-08-02", weight_kg: 71.4 });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/portal/me`);
  await expect(page.getByTestId("your-data")).toBeVisible();

  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
  await expectAxeAAClean(page);

  await page.getByRole("button", { name: "Get a copy of my data" }).click();
  await expect(page.getByText("Your copy is ready.")).toBeVisible();

  const { data: job } = await service
    .from("export_jobs")
    .select("scope, client_id, status")
    .eq("client_id", client!.id)
    .single();
  expect(job?.scope).toBe("client");
  expect(job?.status).toBe("ready");

  await page.getByRole("button", { name: "Delete my data" }).first().click();
  await page.getByRole("button", { name: "Delete my data" }).last().click();
  await expect(page.getByText(/Your coach has been told/)).toBeVisible();

  // The coach hears about it in the thread they already read — system voice.
  const { data: msg } = await service
    .from("messages")
    .select("sender, body")
    .eq("client_id", client!.id)
    .eq("sender", "system")
    .single();
  expect(msg?.body).toContain("asked for their data to be deleted");
});

test("the public data page states the promise without an account", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/docs/data");
  await expect(page.getByRole("heading", { name: "Your data is yours" })).toBeVisible();
  await expect(page.getByText(/RFC-4180 CSV/)).toBeVisible();
  await expect(page.getByText(/30-day delay/)).toBeVisible();

  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
  await expectAxeAAClean(page);
});
