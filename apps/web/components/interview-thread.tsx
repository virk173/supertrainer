"use client";

import * as React from "react";
import { Send } from "lucide-react";

import { Button } from "@supertrainer/ui/components/button";
import { Input } from "@supertrainer/ui/components/input";

import { sendAnswer } from "@/app/(app)/welcome/interview/actions";
import type { InterviewView } from "@/lib/interview/engine";

// The Stage B thread (Phase 2.5). Deliberately a chat, not a form — the turns
// persist to the messages table so this history carries into P6.1's real thread.
export function InterviewThread({
  initial,
  trainerName,
}: {
  initial: InterviewView;
  trainerName: string;
}) {
  const [view, setView] = React.useState<InterviewView>(initial);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [view.messages.length]);

  const closed = view.status !== "in_progress" || view.waitingForNextDay;

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    // Optimistic echo so the thread feels like a conversation.
    setView((v) => ({
      ...v,
      messages: [...v.messages, { id: `pending-${Date.now()}`, sender: "client", body }],
    }));
    setText("");
    const result = await sendAnswer(body);
    setBusy(false);
    if (!result.ok || !result.view) {
      setError(result.message ?? "Couldn't send that.");
      return;
    }
    setView(result.view);
  }

  return (
    <div className="flex flex-1 flex-col" data-testid="interview-thread">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-2">
        {view.messages.length === 0 && (
          <p className="text-sm text-muted-foreground" data-testid="interview-empty">
            {trainerName} will start the conversation in a moment.
          </p>
        )}
        {view.messages.map((m) => (
          <Bubble key={m.id} sender={m.sender} body={m.body} />
        ))}
        <div ref={endRef} />
      </div>

      {view.status === "paused_health" && (
        <p
          className="rounded-lg border bg-surface p-3 text-sm text-muted-foreground"
          data-testid="interview-paused"
        >
          {trainerName} will follow up with you personally about this before we
          continue.
        </p>
      )}

      {view.status === "complete" && (
        <p
          className="rounded-lg border bg-surface p-3 text-sm"
          data-testid="interview-complete"
        >
          That&apos;s everything — thanks! {trainerName} is building your plan now.
        </p>
      )}

      {view.status === "in_progress" && view.waitingForNextDay && (
        <p
          className="rounded-lg border bg-surface p-3 text-sm text-muted-foreground"
          data-testid="interview-waiting"
        >
          That&apos;s enough for today. {trainerName} will pick this up with you
          tomorrow.
        </p>
      )}

      {!closed && (
        <div className="mt-3 flex items-center gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Type your answer…"
            disabled={busy}
            data-testid="interview-input"
            aria-label="Your answer"
          />
          <Button
            type="button"
            size="icon"
            onClick={send}
            disabled={busy || !text.trim()}
            aria-label="Send"
            data-testid="interview-send"
          >
            <Send className="size-4" />
          </Button>
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm text-danger" data-testid="interview-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function Bubble({ sender, body }: { sender: string; body: string }) {
  const mine = sender === "client";
  return (
    <div className={mine ? "flex justify-end" : "flex justify-start"}>
      <div
        data-testid={mine ? "msg-client" : "msg-coach"}
        className="max-w-[85%] rounded-2xl px-3 py-2 text-sm"
        style={
          mine
            ? {
                background: "var(--brand-primary, var(--color-primary))",
                color: "var(--brand-on-primary, var(--color-primary-foreground))",
              }
            : { background: "var(--color-surface)" }
        }
      >
        {body}
      </div>
    </div>
  );
}
