// Phase 9.1 — the DATA REGISTRY. One declarative classification of every public
// table that drives BOTH the export (spec §11 rule 2: "one-click full data
// export… stated publicly as a trust promise") and the deletion sweep.
//
// Why a registry instead of ad-hoc queries: an export that silently misses a
// table breaks a public promise, and a delete that misses one leaves orphaned
// personal data. Both failures are invisible without a single source of truth.
// `registry.spec.ts` diffs this list against the LIVE schema, so a new table
// added in any future phase fails CI until someone classifies it here.
//
// Pure — the only import is a TYPE, erased at build time, so this stays trivially
// testable. Typing `table` as a key of the generated schema means a renamed or
// dropped table breaks the BUILD, not just the completeness test.

import type { Database } from "@supertrainer/db/types";

/** Every table name the generated schema knows about. */
export type TableName = keyof Database["public"]["Tables"];

export type TableScope =
  /** the org row itself */
  | "self"
  /** org-owned, not tied to one client */
  | "org"
  /** belongs to a single client */
  | "client"
  /** platform-internal or global reference data — never org-owned */
  | "platform";

export interface TableSpec {
  table: TableName;
  scope: TableScope;
  /** column scoping rows to an org (null for platform/global tables) */
  orgColumn: string | null;
  /** column scoping rows to a client (null when not client-owned) */
  clientColumn: string | null;
  /** included in a data export — the trust promise */
  exported: boolean;
  /** hard-deleted on purge. false = platform/global, or anonymized instead */
  deleted: boolean;
  /** lower runs first: children before parents, so no FK is left orphaned */
  deleteOrder: number;
  note?: string;
}

const C = (table: TableName, deleteOrder: number, note?: string): TableSpec => ({
  table, scope: "client", orgColumn: "org_id", clientColumn: "client_id",
  exported: true, deleted: true, deleteOrder, note,
});
const O = (table: TableName, deleteOrder: number, note?: string): TableSpec => ({
  table, scope: "org", orgColumn: "org_id", clientColumn: null,
  exported: true, deleted: true, deleteOrder, note,
});

export const DATA_REGISTRY: readonly TableSpec[] = [
  // ── client activity leaves — nothing references these, so they go first ────
  C("meal_logs", 10),
  C("weigh_ins", 10),
  C("gym_checkins", 10),
  C("workout_logs", 10, "references exercises → must precede them"),
  C("ledger_days", 10),
  C("wearable_daily", 10),
  C("progress_photos", 10, "Storage objects removed alongside the rows"),
  C("check_in_responses", 10),
  C("messages", 10),
  C("notifications", 10),
  C("escalations", 10),
  C("drafts", 10),
  C("interview_state", 10),
  C("reminder_rules", 10),
  C("consents", 10, "signed consent PDFs — exported, then deleted on purge"),
  C("events", 10, "product analytics rows carrying a client id"),
  C("payment_records", 10, "references subscriptions → must precede them"),
  C("call_credits", 10, "references subscriptions → must precede them"),
  C("plan_requests", 10),
  {
    ...C("push_subscriptions", 10),
    exported: false,
    note: "device push endpoints + auth keys — deleted, never exported (credential-shaped, no user value)",
  },
  { ...O("draft_edits", 10), note: "org-level edit capture (no client column)" },

  // ── Phase 9.1 job tables — org-level records of exports/deletions ─────────
  // Exported (they are the org's own record of what was taken out and when) and
  // purged. deletion_requests points at export_jobs, and both point at clients,
  // so they clear before either.
  O("deletion_requests", 12, "references export_jobs → must precede it"),
  O("export_jobs", 14, "references clients → precedes the client purge"),

  // ── plan/split state: actives point at versions, so actives go first ───────
  C("plans_active", 18),
  C("splits_active", 18),
  C("plans", 20),
  C("splits", 20),

  // ── things referencing clients/tiers ──────────────────────────────────────
  C("subscriptions", 30, "references tiers → must precede them"),
  C("invites", 30),

  // ── clients, then org-level records ───────────────────────────────────────
  O("clients", 40, "references profiles → must precede them"),
  O("exercise_videos", 48, "references exercises → must precede them"),
  O("leads", 50),
  O("import_batches", 50),
  O("style_exemplars", 50),
  O("style_profiles", 50),
  O("org_onboarding_state", 50),
  O("uploads", 50, "Storage objects removed alongside the rows"),
  O("tiers", 50),
  O("connect_accounts", 50, "Stripe account id only — no secrets stored"),
  O("platform_subscriptions", 50),
  O("exercises", 52, "only org-custom rows match; the global catalogue has org_id null"),
  O("foods", 52, "only org-custom rows match; the global catalogue has org_id null"),
  O("profiles", 55, "referenced by clients.profile_id → deleted after clients"),

  // ── retained, not deleted ─────────────────────────────────────────────────
  {
    table: "audit_log", scope: "org", orgColumn: "org_id", clientColumn: null,
    exported: true, deleted: false, deleteOrder: 60,
    note: "append-only; purge ANONYMISES (drops payload/actor) and keeps a tombstone — deleting it would erase the record that the deletion happened",
  },

  // ── growth (Phase 9.4) ────────────────────────────────────────────────────
  // A trainer's referrals are their own record — who they brought in and what
  // they earned — so both tables travel with them. The ledger goes before the
  // codes it points at.
  {
    table: "referrals", scope: "org", orgColumn: "referrer_org_id", clientColumn: null,
    exported: true, deleted: true, deleteOrder: 45,
    note: "scoped by referrer_org_id; a referral pointing AT this org is FK-nulled, not deleted",
  },
  {
    table: "referral_codes", scope: "org", orgColumn: "org_id", clientColumn: null,
    exported: true, deleted: true, deleteOrder: 46,
  },

  // ── the org row itself, last ──────────────────────────────────────────────
  {
    table: "orgs", scope: "self", orgColumn: "id", clientColumn: null,
    exported: true, deleted: true, deleteOrder: 90,
  },

  // ── platform / global: never org-owned, never exported or purged ──────────
  {
    table: "webhook_events", scope: "platform", orgColumn: null, clientColumn: null,
    exported: false, deleted: false, deleteOrder: 0,
    note: "platform-wide Stripe idempotency ledger — not org data",
  },
  {
    table: "food_aliases", scope: "platform", orgColumn: null, clientColumn: null,
    exported: false, deleted: false, deleteOrder: 0,
    note: "global food-search reference data",
  },
  {
    table: "platform_admins", scope: "platform", orgColumn: null, clientColumn: null,
    exported: false, deleted: false, deleteOrder: 0,
    note: "who operates the platform — not org data",
  },
  {
    table: "admin_credentials", scope: "platform", orgColumn: null, clientColumn: null,
    exported: false, deleted: false, deleteOrder: 0,
    note: "platform-operator hardware keys — credential material, never exported",
  },
  {
    table: "admin_challenges", scope: "platform", orgColumn: null, clientColumn: null,
    exported: false, deleted: false, deleteOrder: 0,
    note: "one-shot WebAuthn challenges — credential material, never exported",
  },
  {
    table: "admin_sessions", scope: "platform", orgColumn: null, clientColumn: null,
    exported: false, deleted: false, deleteOrder: 0,
    note: "platform-operator elevations — credential material, never exported",
  },
  {
    table: "feature_flags", scope: "platform", orgColumn: null, clientColumn: null,
    exported: false, deleted: false, deleteOrder: 0,
    note: "platform rollout configuration",
  },
  {
    table: "platform_incidents", scope: "platform", orgColumn: null, clientColumn: null,
    exported: false, deleted: false, deleteOrder: 0,
    note: "platform status banners",
  },
  {
    table: "platform_audit", scope: "platform", orgColumn: null, clientColumn: null,
    exported: false, deleted: false, deleteOrder: 0,
    note: "console audit trail — platform-wide acts that belong to no org",
  },

  // ── platform telemetry that happens to carry an org_id ────────────────────
  // Not the trainer's content, so not in their archive — but it is ABOUT them,
  // so it dies with them.
  {
    table: "ai_usage", scope: "org", orgColumn: "org_id", clientColumn: null,
    exported: false, deleted: true, deleteOrder: 70,
    note: "platform margin meter — our telemetry about an org, purged with it",
  },
  {
    table: "feature_flag_overrides", scope: "org", orgColumn: "org_id", clientColumn: null,
    exported: false, deleted: true, deleteOrder: 70,
    note: "platform rollout state for one org",
  },
  {
    table: "impersonation_sessions", scope: "org", orgColumn: "org_id", clientColumn: null,
    exported: true, deleted: true, deleteOrder: 70,
    note: "every read-only support view of this org — exported BECAUSE a trainer is entitled to know who looked",
  },
];

/** Every table name the registry knows about. */
export const REGISTRY_TABLES: readonly TableName[] = DATA_REGISTRY.map((t) => t.table);

/** Tables included in an ORG export, in a stable order. */
export function orgExportSpecs(): TableSpec[] {
  return DATA_REGISTRY.filter((t) => t.exported && t.scope !== "platform");
}

/** Tables included in a SINGLE-CLIENT export — only client-owned data, so one
 *  client's export can never leak another client's (or the org's) records. */
export function clientExportSpecs(): TableSpec[] {
  return DATA_REGISTRY.filter((t) => t.exported && t.scope === "client" && t.clientColumn !== null);
}

/** Hard-delete sequence, children first. Ties keep registry order (stable). */
export function deletionSequence(scope: "org" | "client"): TableSpec[] {
  return DATA_REGISTRY.filter((t) => {
    if (!t.deleted) return false;
    if (scope === "client") return t.scope === "client";
    return t.scope === "org" || t.scope === "client" || t.scope === "self";
  }).sort((a, b) => a.deleteOrder - b.deleteOrder);
}

/** Tables anonymised rather than deleted (the tombstone rule). */
export function anonymiseSpecs(): TableSpec[] {
  return DATA_REGISTRY.filter((t) => !t.deleted && t.scope !== "platform");
}
