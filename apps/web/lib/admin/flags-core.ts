import { createHash } from "node:crypto";

// Phase 9.3 — flag resolution, as a pure function so the rollout rule is
// testable and identical everywhere it runs.
//
// Precedence: an explicit per-org override always wins. Otherwise the org falls
// in the ramp if its deterministic bucket is under the percentage. Deterministic
// matters: an org must not flicker in and out of a feature between requests, and
// two servers must agree without coordinating.

export interface FlagDefinition {
  key: string;
  enabledDefault: boolean;
  rolloutPercent: number;
}

/** Stable 0–99 bucket for an org/flag pair. */
export function bucketFor(orgId: string, key: string): number {
  const digest = createHash("sha256").update(`${key}:${orgId}`).digest();
  // First 4 bytes as an unsigned int → modulo 100.
  return digest.readUInt32BE(0) % 100;
}

export function resolveFlag(
  orgId: string,
  flag: FlagDefinition | null,
  override: boolean | null,
): boolean {
  if (override !== null) return override;
  if (!flag) return false; // an unknown flag is off — never fail open
  if (flag.rolloutPercent >= 100) return true;
  if (flag.rolloutPercent <= 0) return flag.enabledDefault;
  return flag.enabledDefault || bucketFor(orgId, flag.key) < flag.rolloutPercent;
}
