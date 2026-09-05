import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { expectAxeAAClean, expectNoHorizontalOverflow, settlePaint } from "./axe";
import { consentClient, seedClient, seedTrainer, serviceClient, uniqueEmail } from "./helpers";

// Phase 9.3 — the platform console. The gate is the interesting part: this one
// session can read every org, so it takes a listed operator AND a physical key,
// and it is invisible to everyone else.

/** A CDP virtual authenticator, so the hardware-key path is tested for real
 *  rather than stubbed away. */
async function attachVirtualKey(page: Page) {
  const client = await page.context().newCDPSession(page);
  await client.send("WebAuthn.enable");
  const { authenticatorId } = await client.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return { client, authenticatorId };
}

async function makePlatformAdmin(profileId: string) {
  await serviceClient().from("platform_admins").insert({ profile_id: profileId, note: "e2e" });
}

test("the console is invisible to a trainer who is not a platform operator", async ({ page }) => {
  const { tokenHash } = await seedTrainer(uniqueEmail("not-admin"));
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/trainer`);
  const res = await page.goto("/admin");
  expect(res?.status(), "an ordinary trainer must get a 404, not a 403").toBe(404);
  await expect(page.getByTestId("admin-unlock")).toHaveCount(0);
  await expect(page.getByTestId("admin-overview")).toHaveCount(0);
});

test("a listed operator sees nothing until a hardware key says so", async ({ page }) => {
  const { userId, tokenHash } = await seedTrainer(uniqueEmail("admin-locked"));
  await makePlatformAdmin(userId);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/admin`);

  // Listed, but not elevated: the door, not the console.
  await expect(page.getByTestId("admin-unlock")).toBeVisible();
  await expect(page.getByTestId("admin-overview")).toHaveCount(0);
  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
  await expectAxeAAClean(page);

  // Even asking for a deeper page directly gets the door.
  await page.goto("/admin/orgs");
  await expect(page.getByTestId("admin-unlock")).toBeVisible();
  await expect(page.getByTestId("admin-orgs")).toHaveCount(0);
});

test("register a key, unlock, and operate: budget, flags, replay, incident banner", async ({ page }) => {
  const service = serviceClient();
  const { userId, tokenHash } = await seedTrainer(uniqueEmail("admin-full"));
  await makePlatformAdmin(userId);

  // A second org with real activity, so the tables have something true to show.
  const suffix = randomUUID().slice(0, 8);
  const orgName = `Console Org ${suffix}`;
  const { data: org } = await service
    .from("orgs")
    .insert({ name: orgName, slug: `console-${suffix}` })
    .select("id")
    .single();
  const orgId = org!.id as string;
  const { data: client } = await service
    .from("clients")
    .insert({ org_id: orgId, status: "active", source: "invite", intake: { name: "Rae Console" } })
    .select("id")
    .single();
  await service.from("ai_usage").insert({
    org_id: orgId,
    task: "plan",
    model: "claude-opus-4-8",
    input_tokens: 1_000_000,
    output_tokens: 200_000,
    cost_micros: 10_000_000,
  });

  await attachVirtualKey(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/admin`);

  // First key: registered from the door itself (nothing to elevate with yet).
  await expect(page.getByTestId("admin-unlock")).toBeVisible();
  await page.getByRole("textbox", { name: "Name this key" }).fill("E2E key");
  await page.getByTestId("admin-register-button").click();
  await expect(page.getByTestId("admin-unlock-button")).toBeVisible();

  const { count: creds } = await service
    .from("admin_credentials")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", userId);
  expect(creds).toBe(1);

  // Now the key opens the console.
  await page.getByTestId("admin-unlock-button").click();
  await expect(page.getByTestId("admin-overview")).toBeVisible();
  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
  await expectAxeAAClean(page);

  const { data: elevation } = await service
    .from("admin_sessions")
    .select("profile_id, elevated_until")
    .eq("profile_id", userId)
    .single();
  expect(elevation).not.toBeNull();
  const minutes = (new Date(elevation!.elevated_until).getTime() - Date.now()) / 60_000;
  expect(minutes, "an elevation must expire on its own").toBeLessThanOrEqual(31);

  // ── org health ────────────────────────────────────────────────────────────
  await page.goto("/admin/orgs");
  await expect(page.getByTestId("admin-orgs")).toBeVisible();
  await expect(page.getByRole("link", { name: orgName })).toBeVisible();
  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
  await expectAxeAAClean(page);

  await page.getByRole("link", { name: orgName }).click();
  await expect(page.getByTestId("admin-org")).toBeVisible();
  // $10 of spend against the $25 default cap.
  await expect(page.getByText("$10.00").first()).toBeVisible();
  await expect(page.getByText("Rae Console")).toBeVisible();

  // Cap it below what they've already spent → over budget.
  await page.getByLabel("Monthly cap (dollars)").fill("5");
  await page.getByRole("button", { name: "Save cap" }).click();
  await expect(page.getByText("Over", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Stand down scheduled AI" }).click();
  await expect(page.getByRole("button", { name: "Resume scheduled AI" })).toBeVisible();
  const { data: throttledOrg } = await service
    .from("orgs")
    .select("ai_throttled_at, ai_budget_micros")
    .eq("id", orgId)
    .single();
  expect(throttledOrg?.ai_throttled_at).not.toBeNull();
  expect(Number(throttledOrg?.ai_budget_micros)).toBe(5_000_000);

  // ── support: a read-only view is recorded, with a reason ──────────────────
  await page.getByLabel("Why do you need to look?").fill("Ticket 412 — plans not delivering");
  await page.getByRole("button", { name: "Open read-only view" }).click();
  await expect(page.getByTestId("view-banner")).toBeVisible();
  const { data: view } = await service
    .from("impersonation_sessions")
    .select("admin_profile_id, reason, ended_at")
    .eq("org_id", orgId)
    .single();
  expect(view?.admin_profile_id).toBe(userId);
  expect(view?.reason).toContain("Ticket 412");
  expect(view?.ended_at).toBeNull();

  // The org's OWN audit log records that we looked — they can read it.
  const { data: audit } = await service
    .from("audit_log")
    .select("action")
    .eq("org_id", orgId)
    .eq("action", "support.view_opened");
  expect(audit?.length).toBe(1);

  await page.getByRole("button", { name: "Close view" }).click();
  await expect(page.getByTestId("view-banner")).toHaveCount(0);

  // Reissuing an invite is a support action, not a trainer one.
  await page.getByRole("button", { name: "Reissue invite" }).click();
  await expect(page.getByText("New invite issued.")).toBeVisible();
  const { count: invites } = await service
    .from("invites")
    .select("id", { count: "exact", head: true })
    .eq("client_id", client!.id);
  expect(invites).toBe(1);

  // ── flags ─────────────────────────────────────────────────────────────────
  await page.goto("/admin/flags");
  await page.getByLabel("Key").fill("wearables");
  await page.getByLabel("What it does").fill("HealthKit sync");
  await page.getByLabel("Ramp %").fill("25");
  await page.getByRole("button", { name: "Create flag" }).click();
  await expect(page.getByText("wearables", { exact: true })).toBeVisible();
  const { data: flag } = await service
    .from("feature_flags")
    .select("key, rollout_percent")
    .eq("key", "wearables")
    .single();
  expect(flag?.rollout_percent).toBe(25);
  await settlePaint(page);
  await expectAxeAAClean(page);

  // ── incidents: publishing one puts a banner in front of real people ───────
  await page.goto("/admin/incidents");
  await page.getByLabel("Title").fill("Push notifications are delayed");
  await page.getByLabel("What people should know").fill("Reminders may arrive late.");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByTestId("incident-row").first()).toBeVisible();
  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
  await expectAxeAAClean(page);

  // A client, in their portal, is told — in the interface's voice.
  const clientEmail = uniqueEmail("banner-client");
  const seeded = await seedClient(clientEmail);
  await consentClient(seeded.userId);
  // A SEPARATE context: signing the client in shares cookies with the admin
  // session otherwise, and would sign the operator out mid-test.
  const clientContext = await page.context().browser()!.newContext({
    baseURL: "http://localhost:3000",
  });
  const clientPage = await clientContext.newPage();
  await clientPage.goto(
    `/auth/confirm?token_hash=${seeded.tokenHash}&type=email&next=/portal`,
  );
  await expect(clientPage.getByTestId("status-banner")).toContainText(
    "Push notifications are delayed",
  );
  await clientContext.close();

  // ── locking closes the door behind you ────────────────────────────────────
  await page.goto("/admin");
  await page.getByRole("button", { name: "Lock" }).click();
  await expect(page.getByTestId("admin-unlock")).toBeVisible();
  await expect(page.getByTestId("admin-overview")).toHaveCount(0);
});

test("a key registered on another domain does not lock the operator out", async ({ page }) => {
  // The lockout this guards against: a credential is bound to the hostname it
  // was created on. If /admin counted credentials without regard to hostname,
  // moving NEXT_PUBLIC_APP_URL to a new domain would offer "unlock" with a key
  // the browser cannot produce, while refusing to register a replacement
  // because one already exists — recoverable only by hand-deleting a row in
  // production.
  const service = serviceClient();
  const { userId, tokenHash } = await seedTrainer(uniqueEmail("admin-otherdomain"));
  await makePlatformAdmin(userId);

  // A key that belongs to a DIFFERENT relying party (as if registered before a
  // domain move). It is real as far as the database is concerned.
  await service.from("admin_credentials").insert({
    profile_id: userId,
    rp_id: "an-old-domain.example",
    credential_id: `stale-${randomUUID()}`,
    public_key: "\\x01",
    counter: 0,
    nickname: "Key from the old domain",
  });

  await attachVirtualKey(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/admin`);

  // The door must offer REGISTRATION, not an unlock that cannot succeed.
  await expect(page.getByTestId("admin-unlock")).toBeVisible();
  await expect(page.getByTestId("admin-register-button")).toBeVisible();
  await expect(page.getByTestId("admin-unlock-button")).toHaveCount(0);

  // …and registering here actually works, without an elevation the operator
  // has no way to obtain on this hostname.
  await page.getByRole("textbox", { name: "Name this key" }).fill("Key for this domain");
  await page.getByTestId("admin-register-button").click();
  await expect(page.getByTestId("admin-unlock-button")).toBeVisible();

  await page.getByTestId("admin-unlock-button").click();
  await expect(page.getByTestId("admin-overview")).toBeVisible();

  // Both credentials coexist, each bound to its own hostname.
  const { data: creds } = await service
    .from("admin_credentials")
    .select("rp_id")
    .eq("profile_id", userId);
  const domains = (creds ?? []).map((c) => c.rp_id).sort();
  expect(domains).toEqual(["an-old-domain.example", "localhost"]);
});
