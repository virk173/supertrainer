import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";

import { deletionSequence, orgExportSpecs } from "@/lib/data/registry";

import { serviceClient, uniqueEmail } from "./helpers";

// Phase 9.1 — the two guarantees behind the trust promise (spec §11 rule 2) and
// the deletion right, exercised END-TO-END through the worker route:
//   1. an export contains EVERY table the registry marks exported
//   2. a purge leaves ZERO rows behind (the FK sweep)

const SECRET = process.env.CRON_SECRET;
test.skip(!SECRET, "CRON_SECRET not set — the data-jobs worker cannot run");

async function seedOrgWithData() {
  const service = serviceClient();
  const { data: org } = await service
    .from("orgs")
    .insert({ name: "Export Org", slug: `exp-${randomUUID().slice(0, 8)}` })
    .select("id")
    .single();
  const orgId = org!.id as string;

  const { data: user } = await service.auth.admin.createUser({
    email: uniqueEmail("exportclient"),
    email_confirm: true,
  });
  const userId = user!.user!.id;
  await service.from("profiles").insert({ id: userId, org_id: orgId, role: "client", display_name: "Exportee" });

  const { data: client } = await service
    .from("clients")
    .insert({ org_id: orgId, profile_id: userId, status: "active", source: "invite", intake: { name: "Exportee" } })
    .select("id")
    .single();
  const clientId = client!.id as string;

  // A spread of real rows so the archive has something to prove.
  await service.from("tiers").insert({ org_id: orgId, name: "Pro", price_cents: 10000, currency: "usd" });
  await service.from("weigh_ins").insert({ org_id: orgId, client_id: clientId, tz_date: "2026-08-01", weight_kg: 80 });
  await service.from("messages").insert({ org_id: orgId, client_id: clientId, sender: "system", body: "hello" });
  await service.from("audit_log").insert({ org_id: orgId, action: "test.seed", entity_type: "org", payload: { a: 1 } });

  return { service, orgId, clientId };
}

async function runWorker(request: import("@playwright/test").APIRequestContext) {
  const res = await request.get("/api/cron/data-jobs", {
    headers: { authorization: `Bearer ${SECRET}` },
  });
  expect(res.status()).toBe(200);
  return res.json();
}

test("an export archive contains every table the registry marks exported", async ({ request }) => {
  const { service, orgId } = await seedOrgWithData();

  const { data: job } = await service
    .from("export_jobs")
    .insert({ org_id: orgId, scope: "org" })
    .select("id")
    .single();

  await runWorker(request);

  const { data: done } = await service
    .from("export_jobs")
    .select("status, storage_path, size_bytes, error")
    .eq("id", job!.id)
    .single();
  expect(done?.error).toBeNull();
  expect(done?.status).toBe("ready");
  expect(done?.size_bytes ?? 0).toBeGreaterThan(0);

  // Pull the real archive back out of Storage and read it.
  const { data: blob } = await service.storage.from("exports").download(done!.storage_path!);
  const bytes = new Uint8Array(await blob!.arrayBuffer());
  const files = unzipSync(bytes);

  const manifest = JSON.parse(strFromU8(files["manifest.json"]!)) as {
    tables: Record<string, number>;
  };

  // THE completeness assertion: nothing the registry promises is missing.
  const promised = orgExportSpecs().map((s) => s.table as string);
  const missing = promised.filter((t) => !(`data/${t}.csv` in files));
  expect(missing, `archive is missing table file(s): ${missing.join(", ")}`).toEqual([]);
  for (const t of promised) expect(manifest.tables).toHaveProperty(t);

  // …and the seeded rows really are in there.
  expect(strFromU8(files["data/clients.csv"]!)).toContain(orgId);
  expect(strFromU8(files["data/weigh_ins.csv"]!)).toContain("80");
  expect(strFromU8(files["data/tiers.csv"]!)).toContain("Pro");
  expect(strFromU8(files["README.txt"]!)).toContain("Your data is yours");
});

test("a purge leaves zero rows behind, and refuses to run without a final export", async ({ request }) => {
  const { service, orgId } = await seedOrgWithData();

  // A request whose grace has already elapsed but with NO final export attached
  // must refuse — we never destroy the only copy of someone's data.
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const { data: bad } = await service
    .from("deletion_requests")
    .insert({ org_id: orgId, scope: "org", grace_until: past })
    .select("id")
    .single();
  await runWorker(request);
  const { data: refused } = await service
    .from("deletion_requests")
    .select("status")
    .eq("id", bad!.id)
    .single();
  expect(refused?.status, "an org purge without a ready export must NOT complete").toBe("pending");
  const { count: stillThere } = await service
    .from("clients")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);
  expect(stillThere).toBe(1);

  // Now do it properly: export first, then purge.
  const { data: job } = await service
    .from("export_jobs")
    .insert({ org_id: orgId, scope: "org" })
    .select("id")
    .single();
  await runWorker(request); // builds the export
  await service.from("deletion_requests").update({ final_export_job_id: job!.id }).eq("id", bad!.id);
  await runWorker(request); // now the purge runs

  const { data: completed } = await service
    .from("deletion_requests")
    .select("status")
    .eq("id", bad!.id)
    .maybeSingle();
  // The request row itself is purged with the org, or marked completed.
  if (completed) expect(completed.status).toBe("completed");

  // THE orphan sweep: every table the registry purges must hold zero rows.
  const svc = service as unknown as {
    from(t: string): { select(c: string, o: object): { eq(k: string, v: string): Promise<{ count: number | null }> } };
  };
  const leftovers: string[] = [];
  for (const spec of deletionSequence("org")) {
    if (!spec.orgColumn) continue;
    const { count } = await svc
      .from(spec.table as string)
      .select("*", { count: "exact", head: true })
      .eq(spec.orgColumn, orgId);
    if ((count ?? 0) > 0) leftovers.push(`${spec.table}=${count}`);
  }
  expect(leftovers, `orphaned rows survived the purge: ${leftovers.join(", ")}`).toEqual([]);
});
