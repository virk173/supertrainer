import "server-only";

import { z } from "zod";

import type { Json } from "@supertrainer/db/types";

import { trackServer } from "@/lib/analytics/server";
import { handleClientMessage } from "@/lib/comms/escalate";
import {
  toMessageView,
  type MessageView,
  type RawMessage,
  type Viewer,
} from "@/lib/chat/message-view";
import { getCurrentClientContext } from "@/lib/ledger/log";
import { getSessionClaims } from "@/lib/onboarding/state";
import { createServiceClient } from "@/lib/supabase/server";

// Phase 6.1 — the thread write/read path. Runs server-side with the service role
// (bypasses RLS) but derives identity from the authenticated session and verifies
// org/client ownership IN CODE (the service-role-tenancy rule): a client can only
// send into their OWN thread; a trainer only into a client that belongs to THEIR
// org. The `sender` is stamped here, never taken from the caller, so a client can
// never post as the coach/assistant, and a read receipt can't be forged.

export const THREAD_PAGE = 50;
const MAX_BODY = 4000;

const SelectCols =
  "id, sender, kind, body, payload, reply_to, read_at, delivered_at, client_tag, created_at";

type MessageRow = {
  id: string;
  sender: string;
  kind: string;
  body: string | null;
  payload: Json;
  reply_to: string | null;
  read_at: string | null;
  delivered_at: string | null;
  client_tag: string | null;
  created_at: string;
};

function toRaw(row: MessageRow): RawMessage {
  return {
    id: row.id,
    sender: row.sender as RawMessage["sender"],
    kind: row.kind as RawMessage["kind"],
    body: row.body,
    payload: row.payload,
    createdAt: row.created_at,
    replyTo: row.reply_to,
    readAt: row.read_at,
    clientTag: row.client_tag,
  };
}

export interface ThreadPage {
  messages: MessageView[];
  /** True when older messages exist before this page (a "load older" affordance). */
  hasMore: boolean;
}

// A page of a thread, returned oldest→newest for rendering. Without `before`,
// returns the newest THREAD_PAGE messages; with it, the page immediately older
// than that ISO timestamp (keyset pagination on created_at).
export async function loadThreadPage(
  clientId: string,
  viewer: Viewer,
  opts: { before?: string; limit?: number } = {},
): Promise<ThreadPage> {
  const service = createServiceClient();
  const limit = Math.min(opts.limit ?? THREAD_PAGE, 200);
  let query = service
    .from("messages")
    .select(SelectCols)
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(limit + 1); // one extra row tells us whether an older page exists
  if (opts.before) query = query.lt("created_at", opts.before);
  const { data } = await query;
  const rows = (data ?? []) as MessageRow[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  // Fetched newest-first for the cursor; reverse to oldest-first for the UI.
  const messages = page.reverse().map((r) => toMessageView(toRaw(r), viewer));
  return { messages, hasMore };
}

export interface SendResult {
  ok: boolean;
  message?: MessageView;
  error?: string;
}

const SendSchema = z.object({
  text: z.string().trim().min(1).max(MAX_BODY),
  clientTag: z.string().max(64).nullish(),
});

// The signed-in client sends a text message into their own thread. Idempotent on
// (client_id, client_tag) so an offline replay never duplicates.
export async function sendClientMessage(input: {
  text: string;
  clientTag?: string | null;
}): Promise<SendResult> {
  const parsed = SendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Empty or too-long message." };

  const ctx = await getCurrentClientContext();
  if (!ctx) return { ok: false, error: "No client for the current session." };

  const service = createServiceClient();
  const tag = parsed.data.clientTag ?? null;

  const { data: row, error } = await service
    .from("messages")
    .insert({
      org_id: ctx.orgId,
      client_id: ctx.clientId,
      sender: "client",
      kind: "text",
      body: parsed.data.text,
      client_tag: tag,
    })
    .select(SelectCols)
    .single();

  if (error) {
    // A replayed offline send collides on the (client_id, client_tag) partial
    // unique index — that means the original already landed, so return it rather
    // than erroring (the partial index can't serve as an upsert arbiter, hence
    // the insert-then-catch instead of onConflict).
    if (error.code === "23505" && tag) {
      const { data: existing } = await service
        .from("messages")
        .select(SelectCols)
        .eq("client_id", ctx.clientId)
        .eq("client_tag", tag)
        .maybeSingle();
      if (existing) return { ok: true, message: toMessageView(toRaw(existing as MessageRow), "client") };
    }
    return { ok: false, error: error.message };
  }

  // Route the message through the fail-closed intent gate (P6.3): on escalation
  // it records the urgent queue item + sends the holding line / crisis card. The
  // message already landed above (realtime fanout is immediate), so this runs
  // after; a classifier outage degrades to the keyword floor, never to "safe".
  const inserted = row as MessageRow;
  try {
    await handleClientMessage(service, {
      orgId: ctx.orgId,
      clientId: ctx.clientId,
      messageId: inserted.id,
      text: parsed.data.text,
    });
  } catch (err) {
    // Never fail a delivered message on a routing error — the keyword floor still
    // ran inside handleClientMessage; a total failure here just skips the holding
    // line (logged), it does not lose the client's message.
    console.error("[chat] escalation routing failed:", err);
  }

  await trackServer({ orgId: ctx.orgId, clientId: ctx.clientId, event: "message_sent", properties: { by: "client" } });
  return { ok: true, message: toMessageView(toRaw(inserted), "client") };
}

// A trainer replies into a client's thread. org ownership verified in code — the
// service role bypasses RLS, so we must confirm the target client is in the
// caller's org (and the caller is staff) before writing.
export async function sendCoachMessage(input: {
  clientId: string;
  text: string;
  replyTo?: string | null;
}): Promise<SendResult> {
  const parsed = SendSchema.safeParse({ text: input.text });
  if (!parsed.success) return { ok: false, error: "Empty or too-long message." };

  const { orgId, role } = await getSessionClaims();
  if (!orgId || (role !== "owner" && role !== "staff")) {
    return { ok: false, error: "Not authorized." };
  }

  const service = createServiceClient();
  const { data: client } = await service
    .from("clients")
    .select("id, org_id, notification_channel")
    .eq("id", input.clientId)
    .maybeSingle();
  if (!client || client.org_id !== orgId) {
    // Either the client doesn't exist or belongs to another org — never write.
    return { ok: false, error: "Not authorized." };
  }

  const { data: row, error } = await service
    .from("messages")
    .insert({
      org_id: orgId,
      client_id: client.id,
      sender: "coach",
      kind: "text",
      body: parsed.data.text,
      reply_to: input.replyTo ?? null,
    })
    .select(SelectCols)
    .single();
  if (error) return { ok: false, error: error.message };

  // Enqueue a delivery notification (P6.2 push ladder drains it). dedupe_key on
  // the message id makes it idempotent; the client's channel picks push vs email.
  await service.from("notifications").insert({
    org_id: orgId,
    client_id: client.id,
    kind: "message",
    channel: client.notification_channel === "push" ? "push" : "email",
    status: "queued",
    dedupe_key: `msg:${(row as MessageRow).id}`,
    payload: { snippet: parsed.data.text.slice(0, 200), message_id: (row as MessageRow).id } as unknown as Json,
  });

  await trackServer({ orgId, clientId: client.id, event: "message_sent", properties: { by: "coach" } });
  return { ok: true, message: toMessageView(toRaw(row as MessageRow), "coach") };
}

// Mark the messages the viewer RECEIVED (not their own) as read. Batched: one
// UPDATE over the still-unread inbound rows. Returns how many flipped.
export async function markThreadRead(clientId: string, viewer: Viewer): Promise<number> {
  const service = createServiceClient();

  // Confirm the caller may touch this thread (tenancy in code).
  if (viewer === "client") {
    const ctx = await getCurrentClientContext();
    if (!ctx || ctx.clientId !== clientId) return 0;
  } else {
    const { orgId, role } = await getSessionClaims();
    if (!orgId || (role !== "owner" && role !== "staff")) return 0;
    const { data: client } = await service
      .from("clients")
      .select("org_id")
      .eq("id", clientId)
      .maybeSingle();
    if (!client || client.org_id !== orgId) return 0;
  }

  // The client reads coach/assistant/system lines; the coach reads client lines.
  const nowIso = new Date().toISOString();
  const query = service
    .from("messages")
    .update({ read_at: nowIso })
    .eq("client_id", clientId)
    .is("read_at", null);
  const scoped = viewer === "client" ? query.neq("sender", "client") : query.eq("sender", "client");
  const { data } = await scoped.select("id");

  // When the CLIENT catches up on their thread, they've seen the pending
  // reminders/messages — stop the delivery ladder for their active notifications
  // (P6.2). The coach reading the client's lines doesn't affect the client's ladder.
  if (viewer === "client") {
    await service
      .from("notifications")
      .update({ seen_at: nowIso })
      .eq("client_id", clientId)
      .is("seen_at", null)
      .in("stage", ["queued", "pushed", "badged"]);
  }

  return (data ?? []).length;
}

// Full-text search within a thread (websearch over body_tsv), newest-first.
export async function searchThread(
  clientId: string,
  viewer: Viewer,
  queryText: string,
  limit = 30,
): Promise<MessageView[]> {
  const q = queryText.trim();
  if (!q) return [];
  const service = createServiceClient();
  const { data } = await service
    .from("messages")
    .select(SelectCols)
    .eq("client_id", clientId)
    .textSearch("body_tsv", q, { type: "websearch", config: "simple" })
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 100));
  return ((data ?? []) as MessageRow[]).map((r) => toMessageView(toRaw(r), viewer));
}
