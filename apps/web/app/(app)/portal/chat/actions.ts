"use server";

import { recordCardAnswer } from "@/lib/cards/answer";
import { loadThreadPage, markThreadRead, sendClientMessage } from "@/lib/chat/thread";
import type { MessageView } from "@/lib/chat/message-view";
import { getCurrentClientContext } from "@/lib/ledger/log";
import { createServiceClient } from "@/lib/supabase/server";

// Phase 6.1 — the client's own thread actions. Every one derives the client from
// the authenticated session (getCurrentClientContext), so a caller can only ever
// act on THEIR OWN thread — the clientId is never taken from the browser.

export async function sendClientChat(input: {
  text: string;
  clientTag?: string | null;
}): Promise<{ ok: boolean; message?: MessageView; error?: string }> {
  return sendClientMessage(input);
}

export async function markClientThreadRead(): Promise<number> {
  const ctx = await getCurrentClientContext();
  if (!ctx) return 0;
  return markThreadRead(ctx.clientId, "client");
}

export async function loadOlderClientChat(
  before: string,
): Promise<{ messages: MessageView[]; hasMore: boolean }> {
  const ctx = await getCurrentClientContext();
  if (!ctx) return { messages: [], hasMore: false };
  return loadThreadPage(ctx.clientId, "client", { before });
}

// P6.5 — record a check-in card's tap-answer. Derives the client from the session,
// so a caller can only answer their OWN card.
export async function answerCardChat(
  messageId: string,
  answer: Record<string, unknown>,
): Promise<{ ok: boolean }> {
  const ctx = await getCurrentClientContext();
  if (!ctx) return { ok: false };
  return recordCardAnswer(createServiceClient(), { clientId: ctx.clientId, messageId, answer });
}
