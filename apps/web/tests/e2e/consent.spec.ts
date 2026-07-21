import { expect, test } from "@playwright/test";

import { renderConsentDoc, consentDocHash, CONSENT_DOC_VERSION } from "../../lib/consent/doc";
import { seedClient, serviceClient, uniqueEmail } from "./helpers";

// DoD: the client funnel is verified on a phone viewport (mobile-first).
test.use({ viewport: { width: 390, height: 844 } });

// ── Hash stability (node-level, no browser) ──────────────────────────────────

test("consent doc hash is stable and context-sensitive", () => {
  const a = renderConsentDoc({ trainerName: "Coach Kay", businessName: "KayFit" });
  const b = renderConsentDoc({ trainerName: "Coach Kay", businessName: "KayFit" });
  expect(consentDocHash(a)).toBe(consentDocHash(b)); // deterministic

  const other = renderConsentDoc({ trainerName: "Coach Zed", businessName: "ZedFit" });
  expect(consentDocHash(other)).not.toBe(consentDocHash(a)); // context changes it

  // The internal LAWYER TODO comment and placeholders never reach the client.
  expect(a).not.toContain("LAWYER TODO");
  expect(a).not.toContain("{{");
  expect(a).toContain("Coach Kay");
});

// ── Blocking gate + sign flow (browser) ──────────────────────────────────────
// PDF rendering is verified below against the artifact the real Next server
// produces and stores during signing (a truer check than transpiling the
// react-pdf component inside Playwright).

test("consent gate blocks the portal, then signing unlocks it with an evidence trail", async ({
  page,
}) => {
  const email = uniqueEmail("consent-client");
  const { userId, orgId, tokenHash } = await seedClient(email);

  // Sign in aiming for /portal — the gate diverts an un-consented client.
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/portal`);
  await expect(page).toHaveURL(/\/consent/);
  await expect(page.getByTestId("consent-doc")).toBeVisible();

  // Every portal route is blocked pre-consent.
  await page.goto("/portal");
  await expect(page).toHaveURL(/\/consent/);

  // Can't sign without scrolling to the end + name + checkbox.
  await expect(page.getByTestId("consent-sign")).toBeDisabled();
  await expect(page.getByTestId("scroll-hint")).toBeVisible();

  // Naming + checking the box alone must NOT unlock signing — the read-to-end
  // gate is independent of (and must be satisfied before) the other two
  // requirements. This is the regression check for the bug where the gate's
  // scrolledEnd flag flipped true on mount before the client had scrolled at
  // all (SF-2): if that bug were reintroduced, the button would already be
  // enabled here, before any scrolling has happened.
  await page.getByTestId("consent-agree").check();
  await page.getByTestId("consent-name").fill("Alex Client");
  await expect(page.getByTestId("consent-sign")).toBeDisabled();
  await expect(page.getByTestId("scroll-hint")).toBeVisible();

  // The scrollable region is keyboard-operable (WCAG 2.1.1): tab to it and
  // page-down instead of only exercising the programmatic scrollTo below.
  await page.getByTestId("consent-doc").focus();
  await expect(page.getByTestId("consent-doc")).toBeFocused();

  // Scrolling to the end-of-document sentinel is what flips the gate — this is
  // detected via IntersectionObserver so it's correct whether the inner doc
  // div or the page itself is what physically scrolls.
  await page.getByTestId("consent-doc").evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(page.getByTestId("consent-sign")).toBeEnabled();
  await expect(page.getByTestId("scroll-hint")).toBeHidden();

  await page.getByTestId("consent-sign").click();

  // Signed → handed off to the install/notification step (Phase 2.4), which is
  // skippable; the portal is no longer blocked.
  await expect(page).toHaveURL(/\/welcome\/notifications/);

  // Evidence trail: an immutable consent row with the hash, name, and UA.
  const service = serviceClient();
  const { data: consent } = await service
    .from("consents")
    .select("doc_version, doc_sha256, signed_name, user_agent, client_id")
    .eq("org_id", orgId)
    .single();
  expect(consent?.doc_version).toBe(CONSENT_DOC_VERSION);
  expect(consent?.doc_sha256).toHaveLength(64);
  expect(consent?.signed_name).toBe("Alex Client");
  expect(consent?.user_agent).toBeTruthy();

  // The hash matches the document the client actually agreed to.
  const expectedHash = consentDocHash(
    renderConsentDoc({ trainerName: "E2E Org", businessName: "E2E Org" }),
  );
  expect(consent?.doc_sha256).toBe(expectedHash);

  // Denormalized flag set on the client row (drives the guard).
  const { data: client } = await service
    .from("clients")
    .select("consent_signed_at")
    .eq("profile_id", userId)
    .single();
  expect(client?.consent_signed_at).toBeTruthy();

  // The branded PDF the server rendered was stored to the private bucket and is
  // a valid PDF (this exercises react-pdf in the real runtime).
  const { data: pdfBlob } = await service.storage
    .from("consents")
    .download(`${orgId}/${consent?.client_id}/consent-${CONSENT_DOC_VERSION}.pdf`);
  expect(pdfBlob, "signed consent PDF should be stored").not.toBeNull();
  const head = Buffer.from(await pdfBlob!.arrayBuffer()).subarray(0, 5).toString("latin1");
  expect(head).toBe("%PDF-");

  // Re-visiting /consent after signing routes back to the portal.
  await page.goto("/consent");
  await expect(page).toHaveURL(/\/portal/);
});
