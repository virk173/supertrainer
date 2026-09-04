import { expect, test } from "@playwright/test";

import {
  DATA_REGISTRY,
  REGISTRY_TABLES,
  clientExportSpecs,
  deletionSequence,
  orgExportSpecs,
} from "@/lib/data/registry";

import { serviceClient } from "./helpers";

// Phase 9.1 — the guard that keeps the export promise (spec §11 rule 2) and the
// deletion right honest. The registry is diffed against the LIVE schema, so a
// table added by any future phase fails CI until it is classified: an
// unclassified table is silently absent from an export, or left behind by a
// purge as orphaned personal data. Both are invisible without this test.

async function livePublicTables(): Promise<string[]> {
  const { data, error } = await serviceClient().rpc("list_public_tables");
  if (error) throw error;
  return (data as unknown as string[]) ?? [];
}

test("every table in the live schema is classified in the data registry", async () => {
  const live = await livePublicTables();
  expect(live.length).toBeGreaterThan(30); // sanity: we really read the schema
  const known: readonly string[] = REGISTRY_TABLES;
  const missing = live.filter((t) => !known.includes(t));
  expect(
    missing,
    `Unclassified table(s) — add them to apps/web/lib/data/registry.ts so they are ` +
      `exported and purged deliberately: ${missing.join(", ")}`,
  ).toEqual([]);
});

test("the registry names no table that has been dropped", async () => {
  const live = await livePublicTables();
  const stale = (REGISTRY_TABLES as readonly string[]).filter((t) => !live.includes(t));
  expect(stale, `Registry names table(s) that no longer exist: ${stale.join(", ")}`).toEqual([]);
});

test("client-scoped specs declare the column that scopes them to one client", () => {
  for (const spec of clientExportSpecs()) {
    expect(spec.clientColumn, `${spec.table} is client-scoped but has no clientColumn`).toBe(
      "client_id",
    );
    expect(spec.orgColumn, `${spec.table} must also carry org_id`).toBe("org_id");
  }
});

test("a single-client export can never reach org-wide or another client's data", () => {
  // Every table in a client export must be client-scoped — no org-level tables.
  for (const spec of clientExportSpecs()) {
    expect(spec.scope).toBe("client");
  }
  // And the org archive must never include platform/global tables.
  for (const spec of orgExportSpecs()) {
    expect(spec.scope).not.toBe("platform");
  }
});

test("deletion runs children before parents (no orphaned rows)", () => {
  const order: string[] = deletionSequence("org").map((s) => s.table);
  const at = (t: string) => order.indexOf(t);
  // Rows that reference another table must be removed first.
  expect(at("payment_records")).toBeLessThan(at("subscriptions")); // FK → subscriptions
  expect(at("call_credits")).toBeLessThan(at("subscriptions"));
  expect(at("subscriptions")).toBeLessThan(at("tiers")); // FK → tiers
  expect(at("plans_active")).toBeLessThan(at("plans"));
  expect(at("splits_active")).toBeLessThan(at("splits"));
  expect(at("plans")).toBeLessThan(at("clients"));
  expect(at("workout_logs")).toBeLessThan(at("exercises")); // FK → exercises
  expect(at("exercise_videos")).toBeLessThan(at("exercises"));
  expect(at("meal_logs")).toBeLessThan(at("foods")); // FK → foods
  expect(at("clients")).toBeLessThan(at("profiles")); // clients.profile_id
  // The org row itself goes last.
  expect(at("orgs")).toBe(order.length - 1);
});

test("a client purge touches only client-scoped tables", () => {
  for (const spec of deletionSequence("client")) {
    expect(spec.scope, `${spec.table} must not be purged by a single-client deletion`).toBe(
      "client",
    );
  }
});

test("platform + global tables are never exported or purged", () => {
  const platform = DATA_REGISTRY.filter((t) => t.scope === "platform");
  expect(platform.length).toBeGreaterThan(0);
  for (const spec of platform) {
    expect(spec.exported, `${spec.table} must not be exported`).toBe(false);
    expect(spec.deleted, `${spec.table} must not be purged`).toBe(false);
  }
});

test("audit_log is retained (anonymised), never hard-deleted", () => {
  const audit = DATA_REGISTRY.find((t) => t.table === "audit_log");
  expect(audit?.exported).toBe(true); // it is the org's own record
  expect(audit?.deleted).toBe(false); // deleting it would erase the deletion record
});
