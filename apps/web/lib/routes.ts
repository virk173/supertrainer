// Route helpers shared by middleware, auth routes, and shells so role→path
// mapping and path-boundary checks live in exactly one place.

// Where a signed-in user belongs, by role. New role landings change here only.
// Accepts the raw claim string (or null/undefined) so callers needn't narrow.
export function roleHomePath(role: string | null | undefined): string {
  if (role === "owner" || role === "staff") return "/trainer";
  if (role === "client") return "/portal";
  return "/onboarding";
}

// True when `pathname` is `href` or a descendant segment of it — so "/trainer"
// matches "/trainer" and "/trainer/clients" but NOT "/trainer-archive".
export function isPathActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Subdomains that are NOT trainer brands — they belong to the platform itself.
const PLATFORM_SUBDOMAINS = new Set(["www", "app", "api"]);

// Given a request host and the platform apex (e.g. "supertrainer.app"), returns
// the trainer brand slug when the host is a branded subdomain
// (coach.supertrainer.app → "coach"), or null for the apex, platform
// subdomains, or any host that isn't under the platform domain (localhost).
export function brandedSlugFromHost(
  host: string | null | undefined,
  platformDomain: string | null | undefined,
): string | null {
  if (!host || !platformDomain) return null;
  const hostname = host.split(":")[0].toLowerCase();
  const suffix = `.${platformDomain.toLowerCase()}`;
  if (!hostname.endsWith(suffix)) return null;
  const sub = hostname.slice(0, -suffix.length);
  // Only a single-label subdomain maps to a brand; skip empty, platform, and
  // any deeper host (a.b.supertrainer.app).
  if (!sub || sub.includes(".") || PLATFORM_SUBDOMAINS.has(sub)) return null;
  return sub;
}

// A `next`/redirect target is safe only if it is a same-origin relative path.
// Rejects absolute URLs and any value that opens an authority. Note that a
// leading "/\" is NOT safe: browsers normalize backslashes to slashes, so
// `Location: /\host` resolves to `//host` (an off-origin redirect) — the second
// character must not start an authority ("/" or "\").
export function safeRelativePath(
  next: string | null | undefined,
  fallback = "/onboarding",
): string {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.length > 1 && (next[1] === "/" || next[1] === "\\")) return fallback;
  return next;
}
