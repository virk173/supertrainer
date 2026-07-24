import type { SupabaseClient } from "@supabase/supabase-js";

import type { ReplyDrafter } from "@supertrainer/ai";
import type { Json } from "@supertrainer/db/types";

import { enqueueDraft } from "@/lib/comms/draft";

// Phase 6.4 — the trainer's queue actions (db-injected, org-verified in code).
// Approve sends the draft as the coach; Edit sends the trainer's edit AND captures
// the diff (draft_edits entity_type='reply' → voice learning via the P4.3 nightly
// job); Dismiss drops it; Rewrite regenerates from the same triggering message.

interface DraftRow {
  id: string;
  org_id: string;
  client_id: string;
  message_id: string | null;
  category: "conversational" | "plan_impact";
  draft_text: string;
  status: string;
}

async function loadPendingDraft(db: SupabaseClient, draftId: string, orgId: string): Promise<DraftRow | null> {
  const { data } = await db
    .from("drafts")
    .select("id, org_id, client_id, message_id, category, draft_text, status")
    .eq("id", draftId)
    .maybeSingle();
  // Tenancy in code (service role bypasses RLS): the draft must be this org's.
  if (!data || data.org_id !== orgId) return null;
  return data as DraftRow;
}

// Send the approved/edited text into the client's thread as the coach + enqueue
// its delivery notification (P6.2 ladder), mirroring sendCoachMessage.
async function sendAsCoach(db: SupabaseClient, orgId: string, clientId: string, text: string): Promise<void> {
  const { data: client } = await db
    .from("clients")
    .select("notification_channel")
    .eq("id", clientId)
    .maybeSingle();
  const { data: msg, error } = await db
    .from("messages")
    .insert({ org_id: orgId, client_id: clientId, sender: "coach", kind: "text", body: text })
    .select("id")
    .single();
  if (error) throw error;
  await db.from("notifications").insert({
    org_id: orgId,
    client_id: clientId,
    kind: "message",
    channel: client?.notification_channel === "push" ? "push" : "email",
    status: "queued",
    dedupe_key: `msg:${msg!.id}`,
    payload: { snippet: text.slice(0, 200), message_id: msg!.id } as unknown as Json,
  });
}

export async function approveDraft(db: SupabaseClient, orgId: string, draftId: string): Promise<{ ok: boolean }> {
  const d = await loadPendingDraft(db, draftId, orgId);
  if (!d || d.status !== "pending") return { ok: false };
  await sendAsCoach(db, orgId, d.client_id, d.draft_text);
  await db.from("drafts").update({ status: "approved", actioned_at: new Date().toISOString() }).eq("id", draftId);
  return { ok: true };
}

export async function editDraft(
  db: SupabaseClient,
  orgId: string,
  draftId: string,
  editedText: string,
  editorId?: string,
): Promise<{ ok: boolean }> {
  const text = editedText.trim();
  if (!text) return { ok: false };
  const d = await loadPendingDraft(db, draftId, orgId);
  if (!d || d.status !== "pending") return { ok: false };
  await sendAsCoach(db, orgId, d.client_id, text);
  // Capture the edit for voice learning (the P4.3 nightly job distills it).
  await db.from("draft_edits").insert({
    org_id: orgId,
    entity_type: "reply",
    entity_id: draftId,
    path: "draft_text",
    before: d.draft_text as unknown as Json,
    after: text as unknown as Json,
    edit_kind: "rewrite",
    editor_id: editorId ?? null,
  });
  await db.from("drafts").update({ status: "edited", actioned_at: new Date().toISOString() }).eq("id", draftId);
  return { ok: true };
}

export async function dismissDraft(db: SupabaseClient, orgId: string, draftId: string): Promise<{ ok: boolean }> {
  const d = await loadPendingDraft(db, draftId, orgId);
  if (!d) return { ok: false };
  await db.from("drafts").update({ status: "dismissed", actioned_at: new Date().toISOString() }).eq("id", draftId);
  return { ok: true };
}

export async function rewriteDraft(
  db: SupabaseClient,
  orgId: string,
  draftId: string,
  deps: { draft?: ReplyDrafter } = {},
): Promise<{ ok: boolean; draftId?: string }> {
  const d = await loadPendingDraft(db, draftId, orgId);
  if (!d || d.status !== "pending" || !d.message_id) return { ok: false };
  const { data: msg } = await db.from("messages").select("body").eq("id", d.message_id).maybeSingle();
  await db.from("drafts").update({ status: "rewritten", actioned_at: new Date().toISOString() }).eq("id", draftId);
  const { draftId: newId } = await enqueueDraft(
    db,
    { orgId, clientId: d.client_id, messageId: d.message_id, text: (msg?.body as string) ?? "", category: d.category },
    { draft: deps.draft },
  );
  return { ok: true, draftId: newId };
}
