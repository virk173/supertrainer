import { createHmac } from "node:crypto";

// Pure helpers for the Stage A teaser limiter (Phase 2 backstop). No DB/server
// imports, so the funnel e2e unit-tests every branch node-level (like
// turnstile.ts).

// Collapse the cosmetic variations that let one prospect look like many: case,
// surrounding space, "+tag" subaddressing (all providers), and — for Gmail
// only — dots in the local part (Gmail ignores them; other providers do not).
// Used ONLY as a rate-limit count key; the raw address is still stored and used
// for contact.
export function normalizeEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at === -1) return trimmed;
  let local = trimmed.slice(0, at);
  let domain = trimmed.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus !== -1) local = local.slice(0, plus);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

// Non-reversible per-source key for the DoS sublimit. HMAC (not a bare hash) so
// the stored value can't be brute-forced back to an IP without the server
// secret. Returns null when we can't/shouldn't key on IP (no client IP, or no
// secret) — the caller then skips the per-IP sublimit ("no-op without keys").
export function hashIp(
  ip: string | null | undefined,
  secret: string | undefined,
): string | null {
  if (!ip || !secret) return null;
  return createHmac("sha256", secret).update(ip).digest("hex");
}

export interface RateLimitCounts {
  emailCount: number;
  orgCount: number;
  /** null → the per-IP sublimit is skipped (no IP or no secret). */
  ipCount: number | null;
}

export interface RateLimits {
  weeklyEmail: number;
  dailyOrg: number;
  dailyIp: number;
}

export type RateLimitReason = "email" | "ip" | "org";

// Precedence: a prospect hammering their own email hears the email message; a
// single flooding source hears the IP message; otherwise the whole link is hot
// (org). ipCount null → the per-IP sublimit is skipped.
export function rateLimitDecision(
  counts: RateLimitCounts,
  limits: RateLimits,
): { ok: boolean; reason?: RateLimitReason } {
  if (counts.emailCount >= limits.weeklyEmail) return { ok: false, reason: "email" };
  if (counts.ipCount !== null && counts.ipCount >= limits.dailyIp)
    return { ok: false, reason: "ip" };
  if (counts.orgCount >= limits.dailyOrg) return { ok: false, reason: "org" };
  return { ok: true };
}
