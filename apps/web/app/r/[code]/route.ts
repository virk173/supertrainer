import { NextResponse, type NextRequest } from "next/server";

import { REFERRAL_COOKIE, REFERRAL_COOKIE_DAYS, resolveCode } from "@/lib/growth/referrals";
import { clientIp } from "@/lib/http/client-ip";
import { publicRateLimit } from "@/lib/http/public-limit";

export const dynamic = "force-dynamic";

// Phase 9.4 — the referral link. One job: remember who sent this person, then
// get out of the way. A trainer code lands on signup; a client's "bring a
// friend" code lands on that coach's own teaser page, pre-attributed.
//
// An unknown code is NOT an error page — the visitor did nothing wrong. They go
// to the front door with no attribution.

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  // A referral code is short enough to enumerate, and each attempt costs a
  // database lookup. This makes enumeration show up as 429s instead of load;
  // the code itself is worth little (it only sets an attribution cookie), so
  // the limit is generous enough that a coach sharing a link at an event is
  // never the one who trips it.
  const ip = clientIp(request.headers) ?? "unknown";
  const decision = publicRateLimit(`ref:${ip}`, { limit: 30, windowSeconds: 60 });
  if (!decision.ok) {
    return NextResponse.json(
      { error: "too many requests" },
      { status: 429, headers: { "retry-after": String(decision.retryAfterSeconds) } },
    );
  }

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
