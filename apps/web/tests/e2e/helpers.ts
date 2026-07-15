import { randomUUID } from "node:crypto";

import { createSupabaseServiceRoleClient } from "@supertrainer/db/server";

const MAILPIT_URL = "http://127.0.0.1:54324";

// Standing rule 1: all Supabase clients come from packages/db, tests included.
// In the Playwright (Node) process requireEnv resolves the keys playwright.
// config.ts loaded from apps/web/.env.local.
export function serviceClient() {
  return createSupabaseServiceRoleClient();
}

// crypto.randomUUID, not Date.now — parallel workers minting emails in the same
// millisecond would otherwise collide on the profiles/orgs unique constraints.
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}@test.local`;
}

// Seeds a claimable client the way Phase 2's invite flow will: auth user + org +
// client profile + client record, all through the service role. Returns the
// magic-link token so the caller can sign in via /auth/confirm.
export async function seedClient(
  email: string,
): Promise<{ userId: string; orgId: string; tokenHash: string }> {
  const service = serviceClient();

  const { data: created, error: createError } =
    await service.auth.admin.createUser({ email, email_confirm: true });
  if (createError) throw createError;
  const userId = created!.user!.id;

  const { data: org, error: orgError } = await service
    .from("orgs")
    .insert({ name: "E2E Org", slug: `e2e-${randomUUID().slice(0, 8)}` })
    .select("id")
    .single();
  if (orgError) throw orgError;

  await service.from("profiles").insert({
    id: userId,
    org_id: org!.id,
    role: "client",
    display_name: "E2E Client",
  });
  await service.from("clients").insert({
    org_id: org!.id,
    profile_id: userId,
    status: "active",
    source: "invite",
  });

  const { data: linkData, error: linkError } =
    await service.auth.admin.generateLink({ type: "magiclink", email });
  if (linkError) throw linkError;

  return {
    userId,
    orgId: org!.id,
    tokenHash: linkData!.properties!.hashed_token,
  };
}

// Poll Mailpit (Supabase local email sink) for the confirm link sent to `email`.
export async function confirmLinkFromEmail(email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const search = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );
    const { messages } = (await search.json()) as {
      messages?: { ID: string }[];
    };

    if (messages?.[0]) {
      const detail = await fetch(
        `${MAILPIT_URL}/api/v1/message/${messages[0].ID}`,
      );
      const body = (await detail.json()) as { HTML?: string; Text?: string };
      const match = `${body.HTML ?? ""}\n${body.Text ?? ""}`.match(
        /http:\/\/localhost:3000\/auth\/confirm[^"'\s<]*/,
      );
      if (match) return match[0].replace(/&amp;/g, "&");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No confirmation email arrived for ${email}`);
}
