"use server";

import type { MessageView } from "@/lib/chat/message-view";
import { loadThreadPage, markThreadRead, sendCoachMessage } from "@/lib/chat/thread";
import { getSessionClaims } from "@/lib/onboarding/state";
import { createServiceClient } from "@/lib/supabase/server";

// Phase 6.1 — the trainer's per-client thread actions. clientId is bound from the
// page but NEVER trusted: sendCoachMessage / markThreadRead re-verify org
// ownership in code (service role bypasses RLS), and loadOlder gates below.

async function staffOwns(clientId: string): Promise<boolean> {
  const { orgId, role } = await getSessionClaims();
  if (!orgId || (role !== "owner" && role !== "staff")) return false;
  const service = createServiceClient();
  const { data } = await service
    .from("clients")
    .select("org_id")
    .eq("id", clientId)
    .maybeSingle();
  return !!data && data.org_id === orgId;
}

export async function sendCoachChat(
  clientId: string,
  input: { text: string; clientTag?: string | null },
): Promise<{ ok: boolean; message?: MessageView; error?: string }> {
  return sendCoachMessage({ clientId, text: input.text });
}

export async function markCoachThreadRead(clientId: string): Promise<number> {
  return markThreadRead(clientId, "coach");
}

export async function loadOlderCoachChat(
  clientId: string,
  before: string,
): Promise<{ messages: MessageView[]; hasMore: boolean }> {
  if (!(await staffOwns(clientId))) return { messages: [], hasMore: false };
  return loadThreadPage(clientId, "coach", { before });
}
