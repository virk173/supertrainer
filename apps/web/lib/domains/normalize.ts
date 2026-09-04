// Phase 9.5 — what counts as a domain a coach may claim. Pure, so the rules are
// testable and identical in the action, the worker, and the test.

const BLOCKED_SUFFIXES = ["vercel.app", "supabase.co", "localhost"];

export interface DomainCheck {
  ok: boolean;
  domain?: string;
  reason?: string;
}

/** Strip scheme, path, port and case; reject anything that isn't a plain host. */
export function normalizeDomain(input: string): DomainCheck {
  let value = input.trim().toLowerCase();
  if (!value) return { ok: false, reason: "Enter a domain." };

  value = value.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
  // A trailing dot is a legal FQDN but not what a host header will carry.
  value = value.replace(/\.$/, "");

  if (value.startsWith("*.")) return { ok: false, reason: "Wildcards aren’t supported." };
  if (!/^[a-z0-9.-]+$/.test(value)) {
    return { ok: false, reason: "That doesn’t look like a domain." };
  }
  if (!value.includes(".")) return { ok: false, reason: "Include the full domain, like coach.com." };
  if (value.includes("..") || value.startsWith("-") || value.endsWith("-")) {
    return { ok: false, reason: "That doesn’t look like a domain." };
  }
  if (value.length > 253) return { ok: false, reason: "That domain is too long." };
  if (value.split(".").some((label) => label.length === 0 || label.length > 63)) {
    return { ok: false, reason: "That doesn’t look like a domain." };
  }

  const platform = (process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "").toLowerCase();
  // Claiming our own domain (or a subdomain of it) would hijack platform
  // routing — a branded subdomain is a different feature with its own rules.
  if (platform && (value === platform || value.endsWith(`.${platform}`))) {
    return { ok: false, reason: "That’s a supertrainer address — use your own domain." };
  }
  if (BLOCKED_SUFFIXES.some((s) => value === s || value.endsWith(`.${s}`))) {
    return { ok: false, reason: "That host can’t be used as a custom domain." };
  }

  return { ok: true, domain: value };
}
