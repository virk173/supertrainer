import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { normalizeDomain } from "@/lib/domains/normalize";

import { expectAxeAAClean, expectNoHorizontalOverflow, settlePaint } from "./axe";
import { seedTrainer, serviceClient, uniqueEmail } from "./helpers";

// Phase 9.5 — custom domains. The routing half is the security-relevant half: a
// hostname only resolves to an org once it is ACTIVE, or a half-verified DNS
// record would let someone serve their page from a coach's domain.

test.describe("what counts as a domain", () => {
  test("strips the parts a person pastes by accident", () => {
    expect(normalizeDomain("  HTTPS://Coach.Example/path?x=1  ")).toEqual({
      ok: true,
      domain: "coach.example",
    });
    expect(normalizeDomain("coach.example:3000")).toEqual({ ok: true, domain: "coach.example" });
    expect(normalizeDomain("coach.example.")).toEqual({ ok: true, domain: "coach.example" });
  });

  test("rejects what would break routing", () => {
    expect(normalizeDomain("").ok).toBe(false);
    expect(normalizeDomain("localhost").ok).toBe(false);
    expect(normalizeDomain("nodots").ok).toBe(false);
    expect(normalizeDomain("*.coach.example").ok).toBe(false);
    expect(normalizeDomain("coach..example").ok).toBe(false);
    expect(normalizeDomain("coach example.com").ok).toBe(false);
    expect(normalizeDomain("my-app.vercel.app").ok).toBe(false);
    expect(normalizeDomain(`${"a".repeat(64)}.example`).ok).toBe(false);
  });

  test("a coach cannot claim a supertrainer address as their own domain", () => {
    const platform = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN;
    test.skip(!platform, "NEXT_PUBLIC_PLATFORM_DOMAIN not set");
    expect(normalizeDomain(platform!).ok).toBe(false);
    expect(normalizeDomain(`someone.${platform}`).ok).toBe(false);
  });
});

test("the settings page fails closed when domains aren't switched on", async ({ page }) => {
  const { tokenHash } = await seedTrainer(uniqueEmail("domain-trainer"));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/trainer/settings/domain`);
  await expect(page.getByTestId("domain-settings")).toBeVisible();

  // Without a platform API token the panel says so instead of half-working.
  if (!process.env.VERCEL_API_TOKEN) {
    await expect(page.getByText(/aren’t switched on for this workspace yet/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Connect domain" })).toHaveCount(0);
  }

  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
  await expectAxeAAClean(page);
});

test("only an ACTIVE domain resolves to a coach's page", async ({ request }) => {
  const service = serviceClient();
  const suffix = randomUUID().slice(0, 8);
  const { data: org } = await service
    .from("orgs")
    .insert({ name: "Domain Coach", slug: `dom-${suffix}` })
    .select("id, slug")
    .single();

  const pending = `pending-${suffix}.example`;
  await service
    .from("custom_domains")
    .insert({ org_id: org!.id, domain: pending, status: "verifying" });

  // Middleware rewrites an unrecognised host's root to /d/{host}; this is that
  // route, which is where the actual authorisation decision is made.
  const unverified = await request.get(`/d/${pending}`);
  expect(
    unverified.status(),
    "a hostname still waiting on DNS must not resolve to an org",
  ).toBe(404);

  // Once active, the same host serves that coach's branded landing.
  await service
    .from("custom_domains")
    .update({ status: "active", verified_at: new Date().toISOString() })
    .eq("domain", pending);
  const live = await request.get(`/d/${pending}`);
  expect(live.status()).toBe(200);
  expect(await live.text()).toContain("Domain Coach");

  // A hostname nobody has claimed is a 404, not somebody else's page.
  const stranger = await request.get(`/d/nobody-${suffix}.example`);
  expect(stranger.status()).toBe(404);

  // And a disconnected domain stops resolving immediately.
  await service.from("custom_domains").delete().eq("domain", pending);
  const gone = await request.get(`/d/${pending}`);
  expect(gone.status()).toBe(404);
});
