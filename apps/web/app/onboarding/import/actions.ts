"use server";

import { revalidatePath } from "next/cache";

import { mapColumns, type ColumnMapping } from "@supertrainer/ai";
import type { Json } from "@supertrainer/db/types";

import { completeStep } from "@/app/onboarding/actions";
import type { MappedRow, SourceRow } from "@/lib/import/fields";
import { getSessionClaims } from "@/lib/onboarding/state";
import { createClient } from "@/lib/supabase/server";

async function requireStaffOrg(): Promise<
  { orgId: string } | { error: string }
> {
  const { orgId, role } = await getSessionClaims();
  if (!orgId) return { error: "Your session expired — sign in again." };
  if (role !== "owner" && role !== "staff") {
    return { error: "Only trainers can import clients." };
  }
  return { orgId };
}

export interface ProposeResult {
  ok: boolean;
  message?: string;
  mapping?: ColumnMapping;
}

// AI proposes a column mapping the trainer confirms — never auto-applied.
export async function aiProposeMapping(
  headers: string[],
  sampleRows: SourceRow[],
): Promise<ProposeResult> {
  const auth = await requireStaffOrg();
  if ("error" in auth) return { ok: false, message: auth.error };
  try {
    const mapping = await mapColumns(headers, sampleRows);
    return { ok: true, mapping };
  } catch (err) {
    console.error("[import] mapColumns failed:", err);
    return { ok: false, message: "Couldn't auto-map — map the columns yourself." };
  }
}

export interface ImportResult {
  ok: boolean;
  message?: string;
  batchId?: string;
  count?: number;
  clients?: { id: string; name: string }[];
}

// Imports mapped rows as lead clients under a batch (undoable). Allergies land
// in health_flags (safety-critical), everything mapped is kept in intake.
export async function importClients(rows: MappedRow[]): Promise<ImportResult> {
  const auth = await requireStaffOrg();
  if ("error" in auth) return { ok: false, message: auth.error };
  if (rows.length === 0) return { ok: false, message: "Nothing to import." };

  const supabase = await createClient();

  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .insert({ org_id: auth.orgId, source: "csv", row_count: rows.length })
    .select("id")
    .single();
  if (batchError || !batch) {
    return { ok: false, message: batchError?.message ?? "Import failed." };
  }

  const inserts = rows.map((row) => ({
    org_id: auth.orgId,
    status: "lead" as const,
    source: "import" as const,
    import_batch_id: batch.id,
    intake: row as unknown as Json,
    health_flags: (row.allergies
      ? { allergies: row.allergies.split(/[,;]/).map((a) => a.trim()).filter(Boolean) }
      : {}) as Json,
  }));

  const { data: created, error: insertError } = await supabase
    .from("clients")
    .insert(inserts)
    .select("id, intake");
  if (insertError) {
    // Roll back the empty batch so it can't be undone to nothing.
    await supabase.from("import_batches").delete().eq("id", batch.id);
    return { ok: false, message: insertError.message };
  }

  await completeStep("import");
  revalidatePath("/onboarding/import");
  revalidatePath("/onboarding");

  return {
    ok: true,
    batchId: batch.id,
    count: created?.length ?? 0,
    clients: (created ?? []).map((c) => ({
      id: c.id,
      name: ((c.intake ?? {}) as MappedRow).name ?? "Unnamed",
    })),
  };
}

export interface DraftInvitesResult {
  ok: boolean;
  message?: string;
  count?: number;
}

// Queues invite drafts (unsent invites) for the selected imported clients.
// Phase 1.7 adds channel/personal_message + the send flow.
export async function draftInvites(
  clientIds: string[],
): Promise<DraftInvitesResult> {
  const auth = await requireStaffOrg();
  if ("error" in auth) return { ok: false, message: auth.error };
  if (clientIds.length === 0) return { ok: false, message: "Select at least one client." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("invites")
    .insert(clientIds.map((id) => ({ org_id: auth.orgId, client_id: id })));
  if (error) return { ok: false, message: error.message };

  revalidatePath("/onboarding/import");
  return { ok: true, count: clientIds.length };
}

export interface UndoResult {
  ok: boolean;
  message?: string;
}

// Reverses an import within 24h — deletes the batch's clients and marks it
// undone.
export async function undoImport(batchId: string): Promise<UndoResult> {
  const auth = await requireStaffOrg();
  if ("error" in auth) return { ok: false, message: auth.error };

  const supabase = await createClient();
  const { data: batch } = await supabase
    .from("import_batches")
    .select("created_at, undone_at")
    .eq("id", batchId)
    .maybeSingle();
  if (!batch) return { ok: false, message: "Import not found." };
  if (batch.undone_at) return { ok: false, message: "Already undone." };

  const ageMs = Date.now() - new Date(batch.created_at).getTime();
  if (ageMs > 24 * 60 * 60 * 1000) {
    return { ok: false, message: "Imports can only be undone within 24 hours." };
  }

  const { error: delError } = await supabase
    .from("clients")
    .delete()
    .eq("import_batch_id", batchId);
  if (delError) return { ok: false, message: delError.message };

  await supabase
    .from("import_batches")
    .update({ undone_at: new Date().toISOString() })
    .eq("id", batchId);

  revalidatePath("/onboarding/import");
  return { ok: true };
}
