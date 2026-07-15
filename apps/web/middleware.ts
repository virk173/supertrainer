import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

// Route guards (docs/plan/PHASE-0-foundations.md §0.3):
//   /trainer/*  → role owner|staff
//   /portal/*   → role client
//   /onboarding → any authenticated user
//   everything else (marketing, /login, /signup, /join, /auth) is public.
export async function middleware(request: NextRequest) {
  const { supabaseResponse, claims } = await updateSession(request);
  const path = request.nextUrl.pathname;

  const role =
    typeof claims?.user_role === "string" ? claims.user_role : null;
  const isAuthed = claims !== null;

  // Any redirect must carry the refreshed session cookies.
  const redirectTo = (pathname: string) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = "";
    const response = NextResponse.redirect(url);
    supabaseResponse.cookies
      .getAll()
      .forEach((cookie) => response.cookies.set(cookie));
    return response;
  };

  if (path.startsWith("/trainer")) {
    if (!isAuthed) return redirectTo("/login");
    if (role !== "owner" && role !== "staff") {
      return redirectTo(role === "client" ? "/portal" : "/onboarding");
    }
  }

  if (path.startsWith("/portal")) {
    if (!isAuthed) return redirectTo("/login");
    if (role !== "client") return redirectTo("/trainer");
  }

  if (path.startsWith("/onboarding") && !isAuthed) {
    return redirectTo("/login");
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
