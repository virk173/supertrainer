import { NextResponse, type NextRequest } from "next/server";

import { REFERRAL_COOKIE, REFERRAL_COOKIE_DAYS, resolveCode } from "@/lib/growth/referrals";

export const dynamic = "force-dynamic";

// Phase 9.4 — the referral link. One job: remember who sent this person, then
// get out of the way. A trainer code lands on signup; a client's "bring a
// friend" code lands on that coach's own teaser page, pre-attributed.
//
// An unknown code is NOT an error page — the visitor did nothing wrong. They go
// to the front door with no attribution.

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const resolved = await resolveCode(code);

  if (!resolved) return NextResponse.redirect(new URL("/", request.url));

  const destination =
    resolved.kind === "client"
      ? new URL(`/c/${resolved.orgSlug}?ref=${resolved.code}`, request.url)
      : new URL("/signup", request.url);

  const response = NextResponse.redirect(destination);
  response.cookies.set(REFERRAL_COOKIE, resolved.code, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: REFERRAL_COOKIE_DAYS * 86_400,
  });
  return response;
}
