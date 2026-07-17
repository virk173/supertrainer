import { NextResponse, type NextRequest } from "next/server";

import {
  brandedSlugFromHost,
  isBrandedPassthroughPath,
  isPathActive,
  roleHomePath,
} from "@/lib/routes";
import { updateSession } from "@/lib/supabase/middleware";

// Route guards (docs/plan/PHASE-0-foundations.md §0.3):
//   /trainer/*  → role owner|staff
//   /portal/*   → role client
//   /onboarding → any authenticated user
//   everything else (marketing, /login, /signup, /join, /auth) is public.
// Branded subdomains ({slug}.<platform>) are rewritten into /c/{slug} (P1.2).
export async function middleware(request: NextRequest) {
  const { supabaseResponse, claims } = await updateSession(request);
  const path = request.nextUrl.pathname;

  const role =
    typeof claims?.user_role === "string" ? claims.user_role : null;
  const isAuthed = claims !== null;

  // Carry the refreshed session cookies onto any response we swap in.
  const withCookies = (response: NextResponse) => {
    supabaseResponse.cookies
      .getAll()
      .forEach((cookie) => response.cookies.set(cookie));
    return response;
  };

  const redirectTo = (pathname: string) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = "";
    return withCookies(NextResponse.redirect(url));
  };

  // Branded subdomain → serve that org's client-facing pages from /c/{slug}.
  // The apex and app/www/api subdomains fall through to normal routing.
  const brandSlug = brandedSlugFromHost(
    request.headers.get("host"),
    process.env.NEXT_PUBLIC_PLATFORM_DOMAIN,
  );
  if (brandSlug && !isBrandedPassthroughPath(path)) {
    const url = request.nextUrl.clone();
    url.pathname = `/c/${brandSlug}${path === "/" ? "" : path}`;
    return withCookies(NextResponse.rewrite(url));
  }

  // Segment-aware matches so "/trainer-x" is not gated as "/trainer".
  if (isPathActive(path, "/trainer")) {
    if (!isAuthed) return redirectTo("/login");
    if (role !== "owner" && role !== "staff") {
      return redirectTo(roleHomePath(role));
    }
  }

  if (isPathActive(path, "/portal")) {
    if (!isAuthed) return redirectTo("/login");
    if (role !== "client") return redirectTo(roleHomePath(role));
  }

  if (isPathActive(path, "/onboarding") && !isAuthed) {
    return redirectTo("/login");
  }

  // The consent gate (Phase 2.3) and the install/notification walkthrough
  // (Phase 2.4) require a signed-in client; each page routes non-clients onward.
  if (
    (isPathActive(path, "/consent") || isPathActive(path, "/welcome")) &&
    !isAuthed
  ) {
    return redirectTo("/login");
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
