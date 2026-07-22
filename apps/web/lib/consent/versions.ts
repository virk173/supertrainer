import { CONSENT_DOC_VERSION } from "./template";

// PO-3 — consent re-sign on a *material* document-version bump.
//
// The coaching agreement is a single global template (name-substituted per org),
// so whether a version change is "material" (a legal change that requires every
// existing client to re-acknowledge) or "cosmetic" (a typo/wording tidy that must
// not create re-sign friction) is a legal determination made in code when the
// lawyer-reviewed template changes — never a per-trainer runtime toggle.
//
// CONSENT_VERSIONS is the ordered history, oldest → newest. `material` describes
// the transition INTO that version: `material: true` raises the minimum version a
// client must have signed to stay current; `material: false` (a cosmetic bump)
// leaves the bar where it was, so clients on the prior version are NOT forced to
// re-sign. The last entry's `version` MUST equal CONSENT_DOC_VERSION (what
// recordConsent stamps) — asserted in tests.
export interface ConsentVersion {
  version: string;
  material: boolean;
}

export const CONSENT_VERSIONS: readonly ConsentVersion[] = [
  // v1 is the initial version; `material` is moot for the first entry (there is
  // no prior consent to invalidate). When a v2 is added, mark it material:true to
  // force existing clients to re-sign, or material:false for a cosmetic edit.
  { version: "v1", material: true },
];

// Position of a version in the ordered history, or -1 if unknown/legacy.
function ordinal(
  version: string,
  versions: readonly ConsentVersion[] = CONSENT_VERSIONS,
): number {
  return versions.findIndex((v) => v.version === version);
}

// The minimum version a client must have signed to be considered current: the
// most recent version marked material. Cosmetic bumps after it don't raise the
// bar. Falls back to the oldest version if (impossibly) none are material.
export function requiredConsentVersion(
  versions: readonly ConsentVersion[] = CONSENT_VERSIONS,
): string {
  for (let i = versions.length - 1; i >= 0; i--) {
    if (versions[i]!.material) return versions[i]!.version;
  }
  return versions[0]!.version;
}

// True when a client must (re-)sign the agreement: they have never signed, they
// signed a version we no longer recognize (fail-closed → re-sign), or they signed
// a version older than the current required (material) version. This is the single
// source of truth for the consent gate on every coaching surface.
export function needsConsent(
  signedVersion: string | null | undefined,
  versions: readonly ConsentVersion[] = CONSENT_VERSIONS,
): boolean {
  if (!signedVersion) return true;
  const signed = ordinal(signedVersion, versions);
  if (signed < 0) return true; // unknown/legacy version — safest to re-acknowledge
  return signed < ordinal(requiredConsentVersion(versions), versions);
}

export { CONSENT_DOC_VERSION };
