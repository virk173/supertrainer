import { expect, test } from "@playwright/test";

import { CONSENT_DOC_VERSION } from "../../lib/consent/template";
import {
  CONSENT_VERSIONS,
  needsConsent,
  requiredConsentVersion,
  type ConsentVersion,
} from "../../lib/consent/versions";

// PO-3 — pure logic for the consent re-sign gate (node-level, no browser).

test("the latest registry version matches the document version the app stamps", () => {
  // recordConsent writes CONSENT_DOC_VERSION; the gate compares against the
  // registry. If these drift, a freshly-signed client could look stale.
  expect(CONSENT_VERSIONS.at(-1)?.version).toBe(CONSENT_DOC_VERSION);
});

test("needsConsent against the live registry", () => {
  expect(needsConsent(null)).toBe(true); // never signed
  expect(needsConsent(undefined)).toBe(true);
  expect(needsConsent(CONSENT_DOC_VERSION)).toBe(false); // current
  expect(needsConsent("v0")).toBe(true); // unknown/legacy version → fail-closed
  // With only v1 shipped, the mechanism is dormant: an on-v1 client is current.
  expect(requiredConsentVersion()).toBe("v1");
});

test("a MATERIAL bump forces prior-version signers to re-sign", () => {
  const reg: ConsentVersion[] = [
    { version: "v1", material: true },
    { version: "v2", material: true },
  ];
  expect(requiredConsentVersion(reg)).toBe("v2");
  expect(needsConsent("v1", reg)).toBe(true); // must re-acknowledge
  expect(needsConsent("v2", reg)).toBe(false); // current
});

test("a COSMETIC bump does NOT force re-sign", () => {
  const reg: ConsentVersion[] = [
    { version: "v1", material: true },
    { version: "v2", material: false }, // typo fix / wording tidy
  ];
  // The required bar stays at v1, so a v1 signer is still current — no friction.
  expect(requiredConsentVersion(reg)).toBe("v1");
  expect(needsConsent("v1", reg)).toBe(false);
  expect(needsConsent("v2", reg)).toBe(false);
});

test("only the LATEST material bump matters across mixed history", () => {
  const reg: ConsentVersion[] = [
    { version: "v1", material: true },
    { version: "v2", material: true }, // material
    { version: "v3", material: false }, // cosmetic after v2
  ];
  expect(requiredConsentVersion(reg)).toBe("v2");
  expect(needsConsent("v1", reg)).toBe(true);
  expect(needsConsent("v2", reg)).toBe(false); // meets the bar
  expect(needsConsent("v3", reg)).toBe(false);
});
