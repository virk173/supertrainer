import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import type { Database } from "@supertrainer/db/types";

import { seedTrainer, serviceClient, uniqueEmail } from "./helpers";

// Phase 9.6 — the scripted cross-tenant attack.
//
// Every other RLS test asserts policy shape inside a transaction. This one is
// the adversary's view: a REAL signed-in trainer, holding a REAL access token
// with real org_id/user_role claims, hitting the public API directly — no app
// code in the way — and trying to read and write another org's data across the
// whole schema. Anything it can reach is a live breach, not a policy detail.
//
// The registry drives the table list, so a table added by a future phase is
// attacked automatically rather than being forgotten here.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Sign a seeded user in for real and return an API client that carries their
 *  access token — exactly what a browser (or a stolen token) would have. */
async function signedInClient(tokenHash: string): Promise<SupabaseClient<Database>> {
  const anon = createClient<Database>(SUPABASE_URL, ANON_KEY);
  const { data, error } = await anon.auth.verifyOtp({ type: "email", token_hash: tokenHash });
  if (error || !data.session) throw new Error(`could not sign in: ${error?.message}`);
  return createClient<Database>(SUPABASE_URL, ANON_KEY, {
    global: { headers: { authorization: `Bearer ${data.session.access_token}` } },
  });
}

interface Victim {
  orgId: string;
  clientId: string;
  planId: string;
  subscriptionId: string;
  messageId: string;
}

/** An org with something worth stealing in every sensitive table. */
async function seedVictim(): Promise<Victim> {
  const service = serviceClient();
  const { data: org } = await service
    .from("orgs")
    .insert({ name: "Victim Coaching", slug: `victim-${randomUUID().slice(0, 8)}` })
    .select("id")
    .single();
  const orgId = org!.id as string;

  const { data: client } = await service
    .from("clients")
    .insert({
      org_id: orgId,
      status: "active",
      source: "invite",
      intake: { name: "Private Person" },
      health_flags: { allergies: ["peanut"], conditions: ["hypertension"] },
    })
    .select("id")
    .single();
  const clientId = client!.id as string;

  const { data: plan } = await service
    .from("plans")
    .insert({ org_id: orgId, client_id: clientId, version: 1, status: "approved", source: "onboarding" })
    .select("id")
    .single();
  const { data: sub } = await service
    .from("subscriptions")
    .insert({ org_id: orgId, client_id: clientId, status: "active" })
    .select("id")
    .single();
  const { data: message } = await service
    .from("messages")
    .insert({ org_id: orgId, client_id: clientId, sender: "client", body: "my private message" })
    .select("id")
    .single();

  await service.from("weigh_ins").insert({ org_id: orgId, client_id: clientId, tz_date: "2026-08-01", weight_kg: 91.2 });
  await service.from("payment_records").insert({ org_id: orgId, client_id: clientId, amount_cents: 19900, status: "paid" });
  await service.from("audit_log").insert({ org_id: orgId, action: "test.victim", entity_type: "org" });

  return {
    orgId,
    clientId,
    planId: plan!.id,
    subscriptionId: sub!.id,
    messageId: message!.id,
  };
}

test("a real trainer JWT cannot read one row of another org, anywhere in the schema", async () => {
  const victim = await seedVictim();
  const attacker = await seedTrainer(uniqueEmail("attacker"));
  const api = await signedInClient(attacker.tokenHash);

  // Every org-scoped table the registry knows about, attacked by org_id.
  const { DATA_REGISTRY } = await import("@/lib/data/registry");
  const targets = DATA_REGISTRY.filter((t) => t.orgColumn && t.scope !== "self");

  // POSITIVE CONTROL. Without this the whole suite could pass vacuously — an
  // unauthenticated client also reads nothing. Prove the token works first.
  const service = serviceClient();
  await service
    .from("clients")
    .insert({ org_id: attacker.orgId, status: "active", source: "invite", intake: { name: "My Own Client" } });
  const { data: own, error: ownErr } = await api
    .from("clients")
    .select("id, intake")
    .eq("org_id", attacker.orgId);
  expect(ownErr).toBeNull();
  expect(own?.length, "the attacker's token must actually work on their OWN org").toBe(1);
  expect(targets.length, "the registry must supply tables to attack").toBeGreaterThan(20);

  const leaked: string[] = [];
  for (const spec of targets) {
    const { data, error } = await (api as unknown as {
      from(t: string): {
        select(c: string): { eq(k: string, v: string): Promise<{ data: unknown[] | null; error: unknown }> };
      };
    })
      .from(spec.table as string)
      .select("*")
      .eq(spec.orgColumn!, victim.orgId);
    // An error is a pass (denied); rows are a breach.
    if (!error && (data?.length ?? 0) > 0) leaked.push(`${spec.table}:${data!.length}`);
  }
  expect(leaked, `cross-org rows readable with a real trainer JWT: ${leaked.join(", ")}`).toEqual([]);

  // And the org row itself.
  const { data: orgRow } = await api.from("orgs").select("id, name").eq("id", victim.orgId);
  expect(orgRow ?? []).toEqual([]);
});

test("a real trainer JWT cannot write into another org", async () => {
  const victim = await seedVictim();
  const attacker = await seedTrainer(uniqueEmail("attacker-write"));
  const api = await signedInClient(attacker.tokenHash);
  const service = serviceClient();

  // 1. Insert a client into their org.
  const { error: insertErr } = await api
    .from("clients")
    .insert({ org_id: victim.orgId, status: "active", source: "invite" });
  expect(insertErr, "inserting a client into another org must be denied").not.toBeNull();

  // 2. Rewrite their plan.
  await api.from("plans").update({ status: "draft" }).eq("id", victim.planId);
  const { data: plan } = await service.from("plans").select("status").eq("id", victim.planId).single();
  expect(plan?.status, "another org's plan must be untouched").toBe("approved");

  // 3. Cancel their subscription (money).
  await api.from("subscriptions").update({ status: "canceled" }).eq("id", victim.subscriptionId);
  const { data: sub } = await service
    .from("subscriptions")
    .select("status")
    .eq("id", victim.subscriptionId)
    .single();
  expect(sub?.status, "another org's subscription must be untouched").toBe("active");

  // 4. Delete their message.
  await api.from("messages").delete().eq("id", victim.messageId);
  const { count } = await service
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("id", victim.messageId);
  expect(count, "another org's message must survive").toBe(1);

  // 5. Move their client into the attacker's org (the tenancy hop).
  await api.from("clients").update({ org_id: attacker.orgId }).eq("id", victim.clientId);
  const { data: stolen } = await service
    .from("clients")
    .select("org_id")
    .eq("id", victim.clientId)
    .single();
  expect(stolen?.org_id, "a client must not be movable between orgs").toBe(victim.orgId);
});

test("a real trainer JWT cannot escalate its own privileges", async () => {
  const attacker = await seedTrainer(uniqueEmail("escalator"));
  const api = await signedInClient(attacker.tokenHash);
  const service = serviceClient();

  // The Phase 8/9 privilege guard: role, org_id and id are not self-editable.
  await api.from("profiles").update({ role: "owner" }).eq("id", attacker.userId);
  await api.from("profiles").update({ org_id: randomUUID() }).eq("id", attacker.userId);
  const { data: profile } = await service
    .from("profiles")
    .select("role, org_id")
    .eq("id", attacker.userId)
    .single();
  expect(profile?.org_id).toBe(attacker.orgId);

  // Nor write itself into the platform console.
  const { error: adminErr } = await api
    .from("platform_admins")
    .insert({ profile_id: attacker.userId });
  expect(adminErr, "a trainer must not be able to make themselves a platform admin").not.toBeNull();

  const { data: admins } = await service
    .from("platform_admins")
    .select("profile_id")
    .eq("profile_id", attacker.userId);
  expect(admins ?? []).toEqual([]);
});

test("an anonymous caller reaches nothing", async () => {
  const victim = await seedVictim();
  const anon = createClient<Database>(SUPABASE_URL, ANON_KEY);

  for (const table of ["clients", "messages", "plans", "subscriptions", "payment_records", "orgs"] as const) {
    const { data } = await anon.from(table).select("*").limit(5);
    expect(data ?? [], `anonymous read of ${table} must be empty`).toEqual([]);
  }

  const { error } = await anon
    .from("clients")
    .insert({ org_id: victim.orgId, status: "active", source: "invite" });
  expect(error, "anonymous insert must be denied").not.toBeNull();
});

test("a public route that hits the database is rate limited per source", async () => {
  const { publicRateLimit, resetPublicRateLimit } = await import("@/lib/http/public-limit");
  resetPublicRateLimit();

  const now = Date.now();
  for (let i = 0; i < 30; i += 1) {
    expect(publicRateLimit("ip:1.2.3.4", { limit: 30, windowSeconds: 60 }, now).ok).toBe(true);
  }
  const blocked = publicRateLimit("ip:1.2.3.4", { limit: 30, windowSeconds: 60 }, now);
  expect(blocked.ok).toBe(false);
  expect(blocked.retryAfterSeconds).toBeGreaterThan(0);

  // A different source is unaffected — one abuser must not lock everyone out.
  expect(publicRateLimit("ip:5.6.7.8", { limit: 30, windowSeconds: 60 }, now).ok).toBe(true);

  // And the window slides: the same source is served again once it has passed.
  expect(
    publicRateLimit("ip:1.2.3.4", { limit: 30, windowSeconds: 60 }, now + 61_000).ok,
  ).toBe(true);
});
