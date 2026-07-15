import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@supertrainer/db/types";

const MAILPIT_URL = "http://127.0.0.1:54324";

function serviceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

// Poll Mailpit (Supabase local email sink) for the confirm link sent to
// `email`.
async function confirmLinkFromEmail(email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const search = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );
    const { messages } = (await search.json()) as {
      messages?: { ID: string }[];
    };

    if (messages?.[0]) {
      const detail = await fetch(
        `${MAILPIT_URL}/api/v1/message/${messages[0].ID}`,
      );
      const body = (await detail.json()) as { HTML?: string; Text?: string };
      const match = `${body.HTML ?? ""}\n${body.Text ?? ""}`.match(
        /http:\/\/localhost:3000\/auth\/confirm[^"'\s<]*/,
      );
      if (match) return match[0].replace(/&amp;/g, "&");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No confirmation email arrived for ${email}`);
}

test("signup → org created → lands on /onboarding → owner reaches /trainer", async ({
  page,
}) => {
  const email = `trainer-${Date.now()}@test.local`;

  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByTestId("otp-sent")).toBeVisible();

  const link = await confirmLinkFromEmail(email);
  await page.goto(link);

  // Post-signup bootstrap created the org and landed us on /onboarding.
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByTestId("org-ready")).toBeVisible();

  // The org + owner profile really exist in the database.
  const service = serviceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("role, org_id")
    .eq("display_name", email.split("@")[0])
    .single();
  expect(profile?.role).toBe("owner");
  expect(profile?.org_id).toBeTruthy();

  // The refreshed JWT carries owner claims — /trainer is reachable.
  await page.goto("/trainer");
  await expect(page.getByTestId("trainer-home")).toBeVisible();
});

test("client role is blocked from /trainer routes", async ({ page }) => {
  const email = `client-${Date.now()}@test.local`;
  const service = serviceClient();

  // Seed a client-role account the way Phase 2 will: auth user + org +
  // client profile, all through the service role.
  const { data: created, error: createError } =
    await service.auth.admin.createUser({ email, email_confirm: true });
  expect(createError).toBeNull();
  const userId = created!.user!.id;

  const { data: org, error: orgError } = await service
    .from("orgs")
    .insert({ name: "E2E Org", slug: `e2e-${Date.now()}` })
    .select("id")
    .single();
  expect(orgError).toBeNull();

  await service.from("profiles").insert({
    id: userId,
    org_id: org!.id,
    role: "client",
    display_name: "E2E Client",
  });
  await service.from("clients").insert({
    org_id: org!.id,
    profile_id: userId,
    status: "active",
    source: "invite",
  });

  // Sign in through the real confirm route using an admin-generated token.
  const { data: linkData, error: linkError } =
    await service.auth.admin.generateLink({ type: "magiclink", email });
  expect(linkError).toBeNull();

  await page.goto(
    `/auth/confirm?token_hash=${linkData!.properties!.hashed_token}&type=email&next=/portal`,
  );
  await expect(page.getByTestId("portal-home")).toBeVisible();

  // The role guard bounces clients from /trainer back to /portal.
  await page.goto("/trainer");
  await expect(page).toHaveURL(/\/portal/);
  await expect(page.getByTestId("portal-home")).toBeVisible();
});
