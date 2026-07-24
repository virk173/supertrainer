"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@supertrainer/ui/components/button";

import type { MessageView } from "@/lib/chat/message-view";

export type AnswerCardFn = (messageId: string, answer: Record<string, unknown>) => Promise<{ ok: boolean }>;

// Phase 6.5 — an interactive check-in card (assistant-labeled). A scale (1–5) or a
// choice; tapping records the answer to check_in_responses via the injected action.
export function CheckInCard({ view, onAnswer }: { view: MessageView; onAnswer: AnswerCardFn }) {
  const p = view.payload ?? {};
  const answerType = (p.answer_type as string) ?? "scale";
  const options = (p.options as string[]) ?? [];
  const [answered, setAnswered] = React.useState<string | number | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit(answer: string | number, payload: Record<string, unknown>) {
    if (busy || answered !== null) return;
    setBusy(true);
    const res = await onAnswer(view.id, payload);
    setBusy(false);
    if (res.ok) setAnswered(answer);
  }

  return (
    <div
      data-testid="checkin-card"
      className="w-full max-w-[85%] rounded-xl border bg-surface-raised p-3"
    >
      <div className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
        <Sparkles className="size-3" aria-hidden="true" />
        <span>AI assistant · Check-in</span>
      </div>
      <p className="mb-2 text-sm text-foreground">{view.body}</p>

      {answered !== null ? (
        <p data-testid="checkin-answered" className="text-xs text-muted-foreground">
          Thanks — logged your answer.
        </p>
      ) : answerType === "scale" ? (
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <Button
              key={n}
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              data-testid={`checkin-scale-${n}`}
              onClick={() => submit(n, { value: n })}
            >
              {n}
            </Button>
          ))}
          {options.length === 2 && (
            <span className="ml-2 text-[10px] text-muted-foreground">
              {options[0]} → {options[1]}
            </span>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1">
          {options.map((o) => (
            <Button
              key={o}
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              data-testid="checkin-choice"
              onClick={() => submit(o, { choice: o })}
            >
              {o}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
