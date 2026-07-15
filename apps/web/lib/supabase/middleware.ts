import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@supertrainer/db/server";

// Session refresh per current Supabase SSR docs. Returns the response (which
// must be returned from middleware as-is, or have its cookies copied onto any
// replacement) plus the validated JWT claims for role guards.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // All Supabase clients come from packages/db (standing rule 1); middleware
  // supplies the request/response cookie bridge.
  const supabase = createSupabaseServerClient({
    getAll() {
      return request.cookies.getAll();
    },
    setAll(cookiesToSet) {
      cookiesToSet.forEach(({ name, value }) =>
        request.cookies.set(name, value),
      );
      supabaseResponse = NextResponse.next({ request });
      cookiesToSet.forEach(({ name, value, options }) =>
        supabaseResponse.cookies.set(name, value, options),
      );
    },
  });

  // Do not run code between createServerClient and the auth call below —
  // it refreshes the session and keeps cookies in sync.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;

  return { supabaseResponse, claims };
}
