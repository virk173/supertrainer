import { expect, test } from "@playwright/test";

import type { Json } from "@supertrainer/db/types";

import { seedTrainer, serviceClient, uniqueEmail } from "./helpers";

// PO-1 — trainer-facing prospect/lead pipeline view. Pure UI/DB, no AI.

async function seedLead(
  orgId: string,
  opts: {
    email: string;
    name: string;
    goal: string;
    allergens?: string[];
    status?: "started" | "preview_shown" | "converted" | "expired";
    intentBand?: "high" | "medium" | "low";
    intentReason?: string;
  },
) {
  const service = serviceClient();
  const { data, error } = await service
    .from("leads")
    .insert({
      org_id: orgId,
      email: opts.email,
      answers: { name: opts.name, goal: opts.goal, email: opts.email } as Json,
      allergens: opts.allergens ?? [],
      status: opts.status ?? "started",
      intent_band: opts.intentBand ?? null,
      intent_reason: opts.intentReason ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id;
}

test("prospects: empty state when the trainer has no leads", async ({ page }) => {
  const { tokenHash } = await seedTrainer(uniqueEmail("prospects-empty"));
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/trainer/prospects`);
  await expect(page.getByTestId("prospects-heading")).toBeVisible();
  await expect(page.getByText(/no prospects yet/i)).toBeVisible();
  await expect(page.getByTestId("prospects-table")).toHaveCount(0);
});

test("prospects: lists org leads with goal, intent, allergen flag and stage", async ({ page }) => {
  const { orgId, tokenHash } = await seedTrainer(uniqueEmail("prospects-list"));
  const hotEmail = uniqueEmail("hot");
  await seedLead(orgId, {
    email: hotEmail,
    name: "Hot Prospect",
    goal: "build_muscle",
    allergens: ["Peanuts"],
    status: "preview_shown",
    intentBand: "high",
    intentReason: "Clear goal and trains often",
  });
  await seedLead(orgId, {
    email: uniqueEmail("cold"),
    name: "Cold Prospect",
    goal: "lose_fat",
  });

  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/trainer/prospects`);
  await expect(page.getByTestId("prospects-table")).toBeVisible();
  await expect(page.getByTestId("prospect-row")).toHaveCount(2);

  // The hot prospect renders name, humanized goal, intent band, allergen flag,
  // funnel stage, and a preview-link action.
  const hot = page.getByTestId("prospect-row").filter({ hasText: "Hot Prospect" });
  await expect(hot).toContainText("Build muscle");
  await expect(hot).toContainText("high");
  await expect(hot).toContainText("1 allergen");
  await expect(hot).toContainText("Preview shown");
  await expect(hot.getByTestId("copy-preview-link")).toBeVisible();

  // The cold prospect has no intent band and no allergens.
  const cold = page.getByTestId("prospect-row").filter({ hasText: "Cold Prospect" });
  await expect(cold).toContainText("Lose fat");
  await expect(cold).toContainText("None");
});

test("prospects: convert manually issues an invite and marks the lead converted", async ({
  page,
}) => {
  const { orgId, tokenHash } = await seedTrainer(uniqueEmail("prospects-convert"));
  const leadEmail = uniqueEmail("convert-me");
  const leadId = await seedLead(orgId, {
    email: leadEmail,
    name: "Convert Me",
    goal: "recomp",
    allergens: ["Shellfish"],
    status: "preview_shown",
  });

  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/trainer/prospects`);
  const row = page.getByTestId("prospect-row").filter({ hasText: "Convert Me" });
  await row.getByTestId("convert-prospect").click();

  // Success surfaces a copyable /join invite link.
  await expect(row.getByTestId("copy-join-link")).toBeVisible({ timeout: 15_000 });

  const service = serviceClient();

  // The lead is now converted and linked to a new client.
  const { data: lead } = await service
    .from("leads")
    .select("status, converted_client_id")
    .eq("id", leadId)
    .single();
  expect(lead?.status).toBe("converted");
  expect(lead?.converted_client_id).toBeTruthy();

  // The client carries the teaser answers + allergens (nothing lost), and an
  // invite was issued for it (the /join accept provisions the account later).
  const { data: client } = await service
    .from("clients")
    .select("source, status, intake, health_flags")
    .eq("id", lead!.converted_client_id!)
    .single();
  expect(client?.source).toBe("invite");
  expect((client?.intake as { email?: string }).email).toBe(leadEmail);
  expect((client?.health_flags as { allergies?: string[] }).allergies).toEqual(["Shellfish"]);

  const { count: inviteCount } = await service
    .from("invites")
    .select("id", { count: "exact", head: true })
    .eq("client_id", lead!.converted_client_id!);
  expect(inviteCount).toBe(1);
});
