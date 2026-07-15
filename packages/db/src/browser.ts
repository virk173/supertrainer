import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./types";

// Next.js only inlines LITERAL `process.env.NEXT_PUBLIC_*` member accesses into
// the client bundle — a dynamic `process.env[name]` lookup (as requireEnv does)
// is left as `undefined` in the browser. So reference the vars literally here.
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY — see .env.example at the repo root",
    );
  }
  return createBrowserClient<Database>(url, anonKey);
}
