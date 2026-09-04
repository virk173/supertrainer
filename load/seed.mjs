#!/usr/bin/env node
// Phase 9.6 — the load-test fixture: 100 orgs × 50 clients, seeded through the
// service role, with REAL access tokens for a sample of them so k6 exercises the
// same RLS path a real request takes. Writes load/fixture.json.
//
// Point it at a STAGING project. It refuses to run against a URL that looks like
// production unless you pass --i-know, because a load fixture in a real database
// is very hard to unpick afterwards.
//
//   node load/seed.mjs --orgs 100 --clients 50

import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !serviceKey || !anonKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  process.exit(2);
}
if (!/localhost|127\.0\.0\.1|staging|preview/.test(url) && !process.argv.includes("--i-know")) {
  console.error(`Refusing to seed ${url} — it doesn't look like staging. Pass --i-know to override.`);
  process.exit(2);
}

const ORGS = arg("orgs", 100);
const CLIENTS = arg("clients", 50);
const TOKEN_SAMPLE = arg("tokens", 20);

const service = createClient(url, serviceKey);
const anon = createClient(url, anonKey);
const run = randomUUID().slice(0, 6);
const fixture = { runId: run, orgs: [], trainerTokens: [], clientTokens: [] };

console.log(`Seeding ${ORGS} orgs × ${CLIENTS} clients (tag load-${run})…`);

for (let o = 0; o < ORGS; o += 1) {
  const { data: org, error } = await service
    .from("orgs")
    .insert({ name: `Load Org ${run}-${o}`, slug: `load-${run}-${o}` })
    .select("id")
    .single();
  if (error) throw error;

  const email = `load-${run}-${o}@loadtest.local`;
  const { data: user } = await service.auth.admin.createUser({ email, email_confirm: true });
  await service.from("profiles").insert({
    id: user.user.id,
    org_id: org.id,
    role: "owner",
    display_name: `Load coach ${o}`,
  });

  const clients = Array.from({ length: CLIENTS }, (_, c) => ({
    org_id: org.id,
    status: "active",
    source: "import",
    intake: { name: `Load client ${o}-${c}` },
  }));
  const { data: inserted } = await service.from("clients").insert(clients).select("id");

  // Each client gets a week of ledger rows so digests and grids have work to do.
  const days = Array.from({ length: 7 }, (_, d) =>
    new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10),
  );
  const weighIns = (inserted ?? []).flatMap((c) =>
    days.map((tz_date) => ({
      org_id: org.id,
      client_id: c.id,
      tz_date,
      weight_kg: 70 + Math.random() * 20,
    })),
  );
  for (let i = 0; i < weighIns.length; i += 500) {
    await service.from("weigh_ins").insert(weighIns.slice(i, i + 500));
  }

  if (fixture.trainerTokens.length < TOKEN_SAMPLE) {
    const { data: link } = await service.auth.admin.generateLink({ type: "magiclink", email });
    const { data: session } = await anon.auth.verifyOtp({
      type: "email",
      token_hash: link.properties.hashed_token,
    });
    if (session?.session) {
      fixture.trainerTokens.push({ orgId: org.id, token: session.session.access_token });
    }
  }

  fixture.orgs.push({ id: org.id, clients: (inserted ?? []).map((c) => c.id) });
  if ((o + 1) % 10 === 0) console.log(`  …${o + 1}/${ORGS} orgs`);
}

writeFileSync("load/fixture.json", JSON.stringify(fixture, null, 2));
console.log(`Done. load/fixture.json written (${fixture.orgs.length} orgs, ${fixture.trainerTokens.length} tokens).`);
console.log(`To remove: delete every org whose slug starts with load-${run}.`);
