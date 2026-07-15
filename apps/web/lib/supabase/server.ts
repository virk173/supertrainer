import { cookies } from "next/headers";

import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@supertrainer/db/server";

// Per current Supabase SSR docs: cookie writes from a Server Component throw —
// swallowed because middleware refreshes sessions.
export async function createClient() {
  const cookieStore = await cookies();

  return createSupabaseServerClient({
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet) {
      try {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options),
        );
      } catch {
        // Called from a Server Component — safe to ignore.
      }
    },
  });
}

export { createSupabaseServiceRoleClient as createServiceClient };
