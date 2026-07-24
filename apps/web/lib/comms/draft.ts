import type { SupabaseClient } from "@supabase/supabase-js";

import { draftReply, serializeConfirmedStyles, type ReplyDrafter } from "@supertrainer/ai";
import type { Json } from "@supertrainer/db/types";

import { assembleClientContext, serializeContext, type ClientContext } from "@/lib/comms/context";

// Phase 6.4 — draft-lane enqueue. Assembles the coded client context, drafts a
// reply in the coach's voice (Sonnet, injectable), and stores it pending for the
// trainer's queue. db-injected so CI drives it with a deterministic drafter.

// The org's confirmed voice profile, serialized for the draft prompt.
export async function styleFor(db: SupabaseClient, orgId: string): Promise<string> {
  const { data } = await db
    .from("style_profiles")
    .select("domain, profile")
    .eq("org_id", orgId)
    .eq("status", "confirmed");
  return serializeConfirmedStyles(data);
}

export interface EnqueueDraftInput {
  orgId: string;
  clientId: string;
  messageId: string;
  text: string;
  category: "conversational" | "plan_impact";
}

export interface EnqueueDraftDeps {
  draft?: ReplyDrafter;
  ctx?: ClientContext;
  styleText?: string;
  now?: Date;
}

export async function enqueueDraft(
  db: SupabaseClient,
  input: EnqueueDraftInput,
  deps: EnqueueDraftDeps = {},
): Promise<{ draftId: string; draftText: string }> {
  const ctx = deps.ctx ?? (await assembleClientContext(db, input.clientId, deps.now ?? new Date()));
  const styleText = deps.styleText ?? (await styleFor(db, input.orgId));
  const contextText = serializeContext(ctx);

  const drafter = deps.draft ?? draftReply;
  const draftText = await drafter({
    contextText,
    triggeringMessage: input.text,
    styleText,
    category: input.category,
    exemplars: [], // pgvector retrieval on style_exemplars lands once P4.3 embeddings are live
  });

  const { data, error } = await db
    .from("drafts")
    .insert({
      org_id: input.orgId,
      client_id: input.clientId,
      message_id: input.messageId,
      category: input.category,
      draft_text: draftText,
      context_snapshot: { serialized: contextText, remaining: ctx.remaining } as unknown as Json,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { draftId: data!.id as string, draftText };
}
