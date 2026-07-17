import { NextResponse, type NextRequest } from "next/server";

import { convertLead } from "@/lib/preview/convert";

// Teaser conversion as a route handler (not a server action) so the tier CTA is
// a full document navigation through here to /auth/confirm — that's what lets
// the confirm route set the client's session cookies (same pattern as the
// invite accept route). Reached by a plain link from the preview page.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; leadId: string }> },
) {
  const { slug, leadId } = await params;
  const tierId = new URL(request.url).searchParams.get("tier");
  const result = await convertLead(slug, leadId, tierId);
  return NextResponse.redirect(new URL(result.redirectTo, request.url));
}
