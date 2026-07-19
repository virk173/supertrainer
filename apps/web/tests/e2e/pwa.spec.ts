import { expect, test, type Page } from "@playwright/test";

import { detectPlatform, isStandaloneFrom } from "../../lib/pwa/platform";
import { consentClient, seedClient, serviceClient, uniqueEmail } from "./helpers";

// ── Detection logic (node-level, pure) ───────────────────────────────────────

test("platform detection covers iPhone, iPadOS-as-Mac, Android, desktop", () => {
  expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari")).toBe("ios");
  expect(detectPlatform("Mozilla/5.0 (iPad; CPU OS 16_4 like Mac OS X) Safari")).toBe("ios");
  // iPadOS 13+ reports as Macintosh — touch points are the only tell.
  expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari", 5)).toBe("ios");
  // A real Mac has no touch points.
  expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari", 0)).toBe("desktop");
  expect(detectPlatform("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome")).toBe("android");
  expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome")).toBe("desktop");
  expect(detectPlatform("")).toBe("desktop");
});

test("standalone detection accepts either display-mode or iOS navigator.standalone", () => {
  expect(isStandaloneFrom({ displayModeStandalone: true })).toBe(true);
  expect(isStandaloneFrom({ displayModeStandalone: false, iosStandalone: true })).toBe(true);
  expect(isStandaloneFrom({ displayModeStandalone: false, iosStandalone: false })).toBe(false);
  expect(isStandaloneFrom({ displayModeStandalone: false })).toBe(false);
});

// ── Manifest + icon (browser) ────────────────────────────────────────────────

test("manifest is org-branded for a signed-in client and generic for anon", async ({
  page,
}) => {
  // Anonymous → platform default.
  const anon = await page.request.get("/manifest.webmanifest");
  expect(anon.status()).toBe(200);
  expect(anon.headers()["content-type"]).toContain("application/manifest+json");
  expect((await anon.json()).name).toBe("supertrainer");

  const { userId, tokenHash } = await seedClient(uniqueEmail("pwa-manifest"));
  await consentClient(userId);
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/portal`);
  await expect(page.getByTestId("portal-home")).toBeVisible();

  // Signed in → the client's coach's app.
  const res = await page.request.get("/manifest.webmanifest");
  const manifest = await res.json();
  expect(manifest.name).toBe("E2E Org");
  expect(manifest.start_url).toBe("/portal");
  expect(manifest.display).toBe("standalone");
  expect(manifest.scope).toBe("/");
  expect(manifest.icons).toHaveLength(3);
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual([
    "192x192",
    "512x512",
    "512x512",
  ]);
  expect(manifest.icons.some((i: { purpose: string }) => i.purpose === "maskable")).toBe(true);
  for (const icon of manifest.icons) {
    expect(icon.type).toBe("image/png");
    expect(icon.src).toContain("/api/icon");
  }

  // The branded icon actually renders as a PNG.
  const icon = await page.request.get(manifest.icons[0].src);
  expect(icon.status()).toBe(200);
  expect(icon.headers()["content-type"]).toContain("image/png");
  expect((await icon.body()).length).toBeGreaterThan(100);
});

// ── Permission flow (mocked) ─────────────────────────────────────────────────

async function mockPermission(page: Page, outcome: "granted" | "denied") {
  await page.addInitScript((result) => {
    Object.defineProperty(window, "Notification", {
      configurable: true,
      writable: true,
      value: {
        permission: "default",
        requestPermission: async () => result,
      },
    });
  }, outcome);
}

async function signedInClient(page: Page, prefix: string) {
  const { userId, orgId, tokenHash } = await seedClient(uniqueEmail(prefix));
  await consentClient(userId);
  await page.goto(
    `/auth/confirm?token_hash=${tokenHash}&type=email&next=/welcome/notifications`,
  );
  await expect(page.getByTestId("notif-walkthrough")).toBeVisible();
  return { userId, orgId };
}

async function channelAndEvents(orgId: string, userId: string) {
  const service = serviceClient();
  const { data: client } = await service
    .from("clients")
    .select("notification_channel")
    .eq("profile_id", userId)
    .single();
  const { data: events } = await service
    .from("events")
    .select("type")
    .eq("org_id", orgId);
  return {
    channel: client?.notification_channel,
    types: new Set((events ?? []).map((e) => e.type)),
  };
}

test("granting permission moves the client to the push channel", async ({ page }) => {
  await mockPermission(page, "granted");
  const { userId, orgId } = await signedInClient(page, "pwa-grant");

  // Desktop UA → straight to the permission step, with the coach's sample push.
  await expect(page.getByTestId("sample-notification")).toContainText("E2E Org");
  await expect(page.getByTestId("enable-step")).toBeVisible();

  await page.getByTestId("enable-push").click();
  await expect(page.getByTestId("portal-home")).toBeVisible();

  const { channel, types } = await channelAndEvents(orgId, userId);
  expect(channel).toBe("push");
  expect(types.has("push_enabled")).toBe(true);
});

test("denying permission falls back to the email_only rung", async ({ page }) => {
  await mockPermission(page, "denied");
  const { userId, orgId } = await signedInClient(page, "pwa-deny");

  await page.getByTestId("enable-push").click();
  await expect(page.getByTestId("portal-home")).toBeVisible();

  const { channel, types } = await channelAndEvents(orgId, userId);
  expect(channel).toBe("email_only");
  expect(types.has("push_skipped")).toBe(true);
});

test("skipping is allowed and records email_only (flow is not blocking)", async ({
  page,
}) => {
  await mockPermission(page, "granted");
  const { userId, orgId } = await signedInClient(page, "pwa-skip");

  await page.getByTestId("skip-push").click();
  await expect(page.getByTestId("portal-home")).toBeVisible();

  const { channel, types } = await channelAndEvents(orgId, userId);
  expect(channel).toBe("email_only");
  expect(types.has("push_skipped")).toBe(true);
});
