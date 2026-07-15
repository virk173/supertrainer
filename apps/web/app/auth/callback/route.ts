import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

import { bootstrapOrgIfNeeded } from "@/lib/auth/bootstrap";
import { safeRelativePath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

// OAuth (Google) PKCE code exchange per current Supabase SSR docs.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  // Guard against open redirect: `next` must be a same-origin relative path.
  const next = safeRelativePath(searchParams.get("next"));

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
