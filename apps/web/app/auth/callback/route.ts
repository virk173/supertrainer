import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

import { bootstrapOrgIfNeeded } from "@/lib/auth/bootstrap";
import { createClient } from "@/lib/supabase/server";

// OAuth (Google) PKCE code exchange per current Supabase SSR docs.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/onboarding";

  if (code) {
    const supabase = await createClient();

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (!next.startsWith("/join")) {
        await bootstrapOrgIfNeeded(supabase);
      }
      redirect(next);
    }
  }

  redirect(`/login?error=${encodeURIComponent("Google sign-in failed")}`);
}
