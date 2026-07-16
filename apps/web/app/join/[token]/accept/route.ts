import { NextResponse, type NextRequest } from "next/server";

import { claimInvite } from "@/lib/invites/claim";

// Invite acceptance as a route handler (not a server action) so the browser
// makes a full document navigation through here to /auth/confirm — a soft
// (client) navigation wouldn't execute the confirm route handler and set the
// session cookies. Reached by a plain link from /join/[token].
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const result = await claimInvite(token);
  return NextResponse.redirect(new URL(result.redirectTo, request.url));
}
