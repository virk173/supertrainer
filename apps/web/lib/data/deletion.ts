import "server-only";

import { recordAudit } from "@supertrainer/db/queries";

import { createServiceClient } from "@/lib/supabase/server";

import { anonymiseSpecs, deletionSequence } from "./registry";

// Phase 9.1 — deletion rights (PIPEDA / US-state privacy). Nothing is destroyed
// synchronously: a request opens a 30-day grace window and only the sweep, run
// after it elapses, hard-deletes. Rows go in registry order (children first) so
// no foreign key is ever orphaned, Storage objects go with them, and audit_log is
// ANONYMISED rather than dropped — deleting it would erase the record that the
// deletion happened.

/** Every bucket whose objects are namespaced by org id in the first path segment. */
const ORG_SCOPED_BUCKETS = [
  "brand",
  "consents",
  "exercise-videos",
  "exports",
  "ingestion",
  "meal-photos",
  "progress-photos",
] as const;

/** Default grace window before a hard delete (spec: 30 days). */
export const DELETION_GRACE_DAYS = 30;

export function graceUntil(now: Date, days = DELETION_GRACE_DAYS): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

export function graceElapsed(graceUntilIso: string, now: Date): boolean {
  return new Date(graceUntilIso).getTime() <= now.getTime();
}

type Service = ReturnType<typeof createServiceClient>;

/** Remove every object under {orgId}/ in each org-scoped bucket. */
async function purgeStorage(service: Service, orgId: string): Promise<number> {
  let removed = 0;
  for (const bucket of ORG_SCOPED_BUCKETS) {
    // list() is per-prefix; walk one level of client folders too.
    const prefixes = [`${orgId}`];
    for (const prefix of prefixes) {
      const { data: entries } = await service.storage.from(bucket).list(prefix, { limit: 1000 });
      const paths: string[] = [];
      for (const e of entries ?? []) {
        if (e.id === null) {
          // a folder — descend one level (client-scoped namespacing)
          const { data: inner } = await service.storage
            .from(bucket)
            .list(`${prefix}/${e.name}`, { limit: 1000 });
          for (const f of inner ?? []) if (f.id !== null) paths.push(`${prefix}/${e.name}/${f.name}`);
        } else {
          paths.push(`${prefix}/${e.name}`);
        }
      }
      if (paths.length > 0) {
        const { error } = await service.storage.from(bucket).remove(paths);
        if (!error) removed += paths.length;
      }
    }
  }
  return removed;
}

export interface DeletionResult {
  scope: "org" | "client";
  rowsDeleted: Record<string, number>;
  storageObjectsRemoved: number;
}

/** Execute a due deletion request. Idempotent: a completed request is a no-op. */
export async function runDeletion(
  requestId: string,
  now = new Date(),
): Promise<DeletionResult | null> {
  const service = createServiceClient();

  const { data: req } = await service
    .from("deletion_requests")
    .select("id, org_id, scope, client_id, status, grace_until, final_export_job_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!req || req.status !== "pending") return null;
  if (!graceElapsed(req.grace_until, now)) return null; // still inside the window

  const scope = req.scope as "org" | "client";

  // An ORG purge must have a completed export first — you do not get to destroy
  // the only copy of someone's data without handing it over.
  if (scope === "org") {
    if (!req.final_export_job_id) {
      throw new Error("deletion: org purge requires a completed final export");
    }
    const { data: exp } = await service
      .from("export_jobs")
      .select("status")
      .eq("id", req.final_export_job_id)
      .maybeSingle();
    if (exp?.status !== "ready") {
      throw new Error("deletion: the final export is not ready — refusing to purge");
    }
  }

  const rowsDeleted: Record<string, number> = {};
  for (const spec of deletionSequence(scope)) {
    let q = service.from(spec.table).delete({ count: "exact" });
    if (spec.orgColumn) q = q.eq(spec.orgColumn, req.org_id);
    if (scope === "client" && spec.clientColumn) q = q.eq(spec.clientColumn, req.client_id!);
    const { count, error } = await q;
    if (error) throw new Error(`deletion: ${spec.table} failed — ${error.message}`);
    rowsDeleted[spec.table] = count ?? 0;
  }

  // Anonymise rather than delete: keep the tombstone proving this happened.
  // audit_log is the only table the registry marks retained-not-deleted; a future
  // one would need its own shape here, so we assert rather than guess.
  for (const spec of anonymiseSpecs()) {
    if (spec.table !== "audit_log") {
      throw new Error(`deletion: no anonymisation defined for ${spec.table}`);
    }
    await service
      .from("audit_log")
      .update({ actor_profile_id: null, payload: {} })
      .eq("org_id", req.org_id);
  }

  const storageObjectsRemoved = scope === "org" ? await purgeStorage(service, req.org_id) : 0;

  await service
    .from("deletion_requests")
    .update({ status: "completed", completed_at: now.toISOString() })
    .eq("id", requestId);

  // The org row itself may be gone; the audit write is best-effort for a client
  // purge (where the org survives) and skipped for a full org purge.
  if (scope === "client") {
    await recordAudit(service, {
      orgId: req.org_id,
      action: "data.client_deleted",
      entityType: "client",
      entityId: req.client_id,
      payload: { rows_deleted: rowsDeleted },
    });
  }

  return { scope, rowsDeleted, storageObjectsRemoved };
}
