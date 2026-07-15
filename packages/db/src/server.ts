import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

import { requireEnv } from "./env";
import type { Database } from "./types";

export interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

// Framework-agnostic cookie bridge so this package doesn't import next/headers.
// apps/web passes an adapter built from cookies() per the Supabase SSR docs
// (auth session wiring is finalized in Phase 0.3).
export interface CookieAdapter {
  getAll(): { name: string; value: string }[];
  setAll(cookies: CookieToSet[]): void;
}

export function createSupabaseServerClient(cookies: CookieAdapter) {
  return createServerClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { cookies },
  );
}

// Bypasses RLS — server-only, for jobs and admin operations that act across
// orgs. Never import from client components; SUPABASE_SERVICE_ROLE_KEY must
// never reach the browser.
export function createSupabaseServiceRoleClient() {
  return createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
