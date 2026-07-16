// Subdomain slug rules shared by the brand form (client preview + validation)
// and the save action (authoritative check). A slug becomes {slug}.<platform>
// and /c/{slug}, so it must be DNS-safe and must not collide with a reserved
// path or system subdomain.

export const SLUG_MIN = 3;
export const SLUG_MAX = 32;

// Paths and system subdomains a trainer must never claim. Kept lowercase.
export const RESERVED_SLUGS = new Set<string>([
  "www",
  "api",
  "app",
  "apps",
  "admin",
  "portal",
  "trainer",
  "c",
  "join",
  "auth",
  "login",
  "signup",
  "signout",
  "onboarding",
  "dashboard",
  "settings",
  "billing",
  "stripe",
  "webhook",
  "webhooks",
  "static",
  "assets",
  "cdn",
  "mail",
  "email",
  "blog",
  "help",
  "support",
  "status",
  "docs",
  "about",
  "pricing",
  "supertrainer",
]);

// Normalizes arbitrary text toward a valid slug: lowercase, non-alphanumerics
// to single hyphens, trimmed, length-capped. Not authoritative — pair with
// validateSlug for the yes/no answer.
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX);
}

export type SlugError =
  | "too_short"
  | "too_long"
  | "invalid_chars"
  | "reserved";

// Structural validation only (format + reserved list). Uniqueness is a DB
// concern checked in the save action.
export function validateSlug(slug: string): SlugError | null {
  if (slug.length < SLUG_MIN) return "too_short";
  if (slug.length > SLUG_MAX) return "too_long";
  // Lowercase alphanumerics and single interior hyphens; no leading/trailing/
  // doubled hyphens.
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return "invalid_chars";
  if (RESERVED_SLUGS.has(slug)) return "reserved";
  return null;
}

export const SLUG_ERROR_MESSAGE: Record<SlugError, string> = {
  too_short: `Handle must be at least ${SLUG_MIN} characters.`,
  too_long: `Handle must be at most ${SLUG_MAX} characters.`,
  invalid_chars:
    "Use lowercase letters, numbers, and single hyphens between them.",
  reserved: "That handle is reserved — pick another.",
};
