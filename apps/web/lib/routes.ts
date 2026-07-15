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

// A `next`/redirect target is safe only if it is a same-origin relative path.
// Rejects absolute URLs and protocol-relative "//host" (open-redirect vectors).
export function safeRelativePath(
  next: string | null | undefined,
  fallback = "/onboarding",
): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}
