"use client";

import * as React from "react";
import { ImagePlus, Send } from "lucide-react";
import Link from "next/link";

import { createSupabaseBrowserClient } from "@supertrainer/db/browser";
import { Button } from "@supertrainer/ui/components/button";
import { Input } from "@supertrainer/ui/components/input";
import { cn } from "@supertrainer/ui/lib/utils";

import type { AnswerCardFn } from "@/components/chat/check-in-card";
import { MessageItem } from "@/components/chat/message-item";
import {
  rawFromRow,
  toMessageView,
  type MessageView,
  type Viewer,
} from "@/lib/chat/message-view";
import { registerHandler, runOrQueue } from "@/lib/offline/queue";

export type SendAction = (input: {
  text: string;
  clientTag?: string | null;
}) => Promise<{ ok: boolean; message?: MessageView; error?: string }>;

export type MarkReadAction = () => Promise<number>;
export type LoadOlderAction = (
  before: string,
) => Promise<{ messages: MessageView[]; hasMore: boolean }>;

function randomTag(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

function byCreatedAt(a: MessageView, b: MessageView): number {
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
}

// Merge one message in, replacing an optimistic pending twin (by explicit id, or
// by matching client_tag for a realtime echo of a still-pending offline send).
function reconcile(
  prev: MessageView[],
  incoming: MessageView,
  pendingId?: string,
): MessageView[] {
  const out: MessageView[] = [];
  let replaced = false;
  for (const m of prev) {
    if (!replaced && pendingId && m.id === pendingId) {
      out.push(incoming);
      replaced = true;
      continue;
    }
    if (m.id === incoming.id) {
      out.push(incoming);
      replaced = true;
      continue;
    }
    if (
      !replaced &&
      incoming.clientTag &&
      m.id.startsWith("pending:") &&
      m.clientTag === incoming.clientTag
    ) {
      out.push(incoming);
      replaced = true;
      continue;
    }
    out.push(m);
  }
  if (!replaced) out.push(incoming);
  // Defensive: collapse any accidental id duplicates (last write wins).
  const byId = new Map<string, MessageView>();
  for (const m of out) byId.set(m.id, m);
  return [...byId.values()].sort(byCreatedAt);
}

export function ThreadView({
  viewer,
  clientId,
  initial,
  hasMore: initialHasMore,
  trainerName,
  sendAction,
  markReadAction,
  loadOlderAction,
  answerCardAction,
  emptyHint,
}: {
  viewer: Viewer;
  clientId: string;
  initial: MessageView[];
  hasMore: boolean;
  trainerName: string;
  sendAction: SendAction;
  markReadAction: MarkReadAction;
  loadOlderAction: LoadOlderAction;
  answerCardAction?: AnswerCardFn;
  emptyHint: string;
}) {
  const [messages, setMessages] = React.useState<MessageView[]>(initial);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = React.useState(false);
  const [peerTyping, setPeerTyping] = React.useState(false);

  const endRef = React.useRef<HTMLDivElement>(null);
  const presenceKey = React.useRef<string>(randomTag());
  const channelRef = React.useRef<ReturnType<
    ReturnType<typeof createSupabaseBrowserClient>["channel"]
  > | null>(null);
  const typingTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const offlineKind = `chat-send:${clientId}`;

  // markReadAction is stable enough, but keep the latest without re-subscribing.
  const markReadRef = React.useRef(markReadAction);
  markReadRef.current = markReadAction;

  // ── Realtime: postgres_changes for this thread + presence for typing ────────
  React.useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const onRow = (payload: { new: Record<string, unknown> }) => {
      const view = toMessageView(rawFromRow(payload.new), viewer);
      setMessages((prev) => reconcile(prev, view));
      // A new inbound message → mark the thread read (best-effort).
      if (view.align === "theirs") void markReadRef.current();
    };

    void (async () => {
      // Authorize the Realtime socket as the logged-in user BEFORE subscribing.
      // Presence/Broadcast work on the anon socket, but postgres_changes is
      // RLS-gated — without the access token the subscriber sees no rows and no
      // change events ever arrive.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      await supabase.realtime.setAuth(data.session?.access_token);
      if (cancelled) return;

      const ch = supabase.channel(`thread:${clientId}`, {
        config: { presence: { key: presenceKey.current } },
      });
      channel = ch;
      channelRef.current = ch;

      ch.on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `client_id=eq.${clientId}` }, onRow)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `client_id=eq.${clientId}` }, onRow)
        .on("presence", { event: "sync" }, () => {
          const state = ch.presenceState<{ typing: boolean; viewer: Viewer }>();
          let typing = false;
          for (const [key, metas] of Object.entries(state)) {
            if (key === presenceKey.current) continue;
            if (metas.some((m) => m.typing)) typing = true;
          }
          setPeerTyping(typing);
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            void ch.track({ typing: false, viewer });
            void markReadRef.current();
          }
        });
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [clientId, viewer]);

  // Register the offline replay handler for the client's outbound sends (once).
  React.useEffect(() => {
    if (viewer !== "client") return;
    registerHandler(offlineKind, async (payload) => {
      const p = payload as { text: string; clientTag: string };
      const result = await sendAction({ text: p.text, clientTag: p.clientTag });
      if (!result.ok) throw new Error(result.error ?? "send failed");
      return result;
    });
  }, [offlineKind, sendAction, viewer]);

  // Auto-scroll to the newest message.
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function broadcastTyping(typing: boolean) {
    void channelRef.current?.track({ typing, viewer });
  }

  function onInput(value: string) {
    setText(value);
    broadcastTyping(value.length > 0);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => broadcastTyping(false), 2500);
  }

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    setText("");
    broadcastTyping(false);

    const clientTag = randomTag();
    const pendingId = `pending:${clientTag}`;
    const now = new Date().toISOString();
    const optimistic: MessageView = {
      id: pendingId,
      voice: viewer === "client" ? "client" : "coach",
      align: "mine",
      isAi: false,
      automated: false,
      label: null,
      showCoachAvatar: false,
      kind: "text",
      body,
      isStructured: false,
      createdAt: now,
      replyTo: null,
      readAt: null,
      clientTag,
      payload: null,
    };
    setMessages((prev) => reconcile(prev, optimistic));

    try {
      if (viewer === "client") {
        const res = await runOrQueue(offlineKind, { text: body, clientTag });
        if (res.status === "queued") {
          // Stays optimistic; the realtime echo (matched by clientTag) reconciles
          // it on reconnect. Nothing more to do.
          setBusy(false);
          return;
        }
        const result = res.result as { ok: boolean; message?: MessageView; error?: string };
        if (!result.ok || !result.message) {
          setMessages((prev) => prev.filter((m) => m.id !== pendingId));
          setError(result.error ?? "Couldn't send that.");
        } else {
          setMessages((prev) => reconcile(prev, result.message!, pendingId));
        }
      } else {
        const result = await sendAction({ text: body });
        if (!result.ok || !result.message) {
          setMessages((prev) => prev.filter((m) => m.id !== pendingId));
          setError(result.error ?? "Couldn't send that.");
        } else {
          setMessages((prev) => reconcile(prev, result.message!, pendingId));
        }
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== pendingId));
      setError("Couldn't send that.");
    } finally {
      setBusy(false);
    }
  }

  async function loadOlder() {
    if (loadingOlder || messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const older = await loadOlderAction(messages[0]!.createdAt);
      setMessages((prev) => {
        const merged = new Map<string, MessageView>();
        for (const m of [...older.messages, ...prev]) merged.set(m.id, m);
        return [...merged.values()].sort(byCreatedAt);
      });
      setHasMore(older.hasMore);
    } finally {
      setLoadingOlder(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="chat-thread">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-2">
        {hasMore && (
          <div className="flex justify-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={loadOlder}
              disabled={loadingOlder}
              data-testid="load-older"
            >
              {loadingOlder ? "Loading…" : "Load earlier messages"}
            </Button>
          </div>
        )}

        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground" data-testid="chat-empty">
            {emptyHint}
          </p>
        )}

        {messages.map((m) => (
          <MessageItem key={m.id} view={m} trainerName={trainerName} onAnswer={answerCardAction} />
        ))}

        {peerTyping && (
          <p className="text-xs italic text-muted-foreground" data-testid="typing-indicator">
            {viewer === "client" ? `${trainerName} is typing…` : "typing…"}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <div className="mt-3 flex items-center gap-2">
        {viewer === "client" && (
          <Button
            asChild
            type="button"
            size="icon"
            variant="outline"
            aria-label="Attach a photo or voice note"
            data-testid="chat-attach"
          >
            {/* Photo/voice capture lives in the P3 logger; the composer routes there
                so a photo can flow into the meal-log path (offer "log this?"). */}
            <Link href="/portal/log">
              <ImagePlus className="size-4" />
            </Link>
          </Button>
        )}
        <Input
          value={text}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Type a message…"
          disabled={busy}
          data-testid="chat-input"
          aria-label="Message"
        />
        <Button
          type="button"
          size="icon"
          onClick={send}
          disabled={busy || !text.trim()}
          aria-label="Send"
          data-testid="chat-send"
        >
          <Send className={cn("size-4", busy && "animate-pulse")} />
        </Button>
      </div>

      {error && (
        <p className="mt-2 text-sm text-danger" data-testid="chat-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
