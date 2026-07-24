"use client";

import * as React from "react";
import { CheckCheck, FileText, Sparkles } from "lucide-react";

import { Avatar } from "@supertrainer/ui/components/avatar";
import { cn } from "@supertrainer/ui/lib/utils";

import { CheckInCard, type AnswerCardFn } from "@/components/chat/check-in-card";
import type { MessageView } from "@/lib/chat/message-view";

// Phase 6.1 — one thread message. The visual identity comes straight from the
// classified MessageView, so the transparency rule (assistant ≠ coach) is enforced
// in one tested place. A coach message is the only one that wears the trainer
// avatar; an AI/automated message always carries its label and a distinct surface.

export function MessageItem({
  view,
  trainerName,
  onAnswer,
}: {
  view: MessageView;
  trainerName: string;
  onAnswer?: AnswerCardFn;
}) {
  // A deliverable check-in card (P6.5) the client can answer inline.
  if (view.isStructured && view.payload?.check_in && onAnswer) {
    return <CheckInCard view={view} onAnswer={onAnswer} />;
  }
  if (view.isStructured) return <StructuredCard view={view} trainerName={trainerName} />;

  const mine = view.align === "mine";

  return (
    <div
      className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}
      data-testid={`msg-${view.voice}`}
      data-voice={view.voice}
    >
      {/* Sender identity line — coach avatar+name, or the AI/automated label. */}
      {!mine && view.voice === "coach" && (
        <div
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
          data-testid="coach-identity"
        >
          <Avatar name={trainerName} className="size-5 text-[9px]" data-testid="coach-avatar" />
          <span className="font-medium text-foreground">{trainerName}</span>
        </div>
      )}
      {!mine && view.label && (
        <div
          className="flex items-center gap-1 text-[11px] text-muted-foreground"
          data-testid="ai-label"
        >
          <Sparkles className="size-3" aria-hidden="true" />
          <span>{view.label}</span>
        </div>
      )}

      <div
        data-testid="msg-bubble"
        className={cn(
          "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm",
          // AI/automated messages get a bordered, un-branded surface so they can
          // never be mistaken for a coach (or client) bubble.
          view.automated && "border bg-surface text-foreground",
          !mine && view.voice === "coach" && "bg-surface-raised text-foreground",
        )}
        style={
          mine && !view.automated
            ? {
                background: "var(--brand-primary, var(--color-primary))",
                color: "var(--brand-on-primary, var(--color-primary-foreground))",
              }
            : undefined
        }
      >
        {view.body}
      </div>

      {mine && (
        <span
          className="flex items-center gap-1 text-[10px] text-muted-foreground"
          data-testid={view.readAt ? "read-tick" : "sent-tick"}
        >
          <CheckCheck
            className={cn("size-3", view.readAt && "text-primary")}
            aria-hidden="true"
          />
          {view.readAt ? "Read" : "Sent"}
        </span>
      )}
    </div>
  );
}

// A structured card (check-in, meal confirmation, plan delivery). Minimal here —
// P6.5 builds the interactive check-in cards, P4/P5 the plan-delivery preview.
function StructuredCard({ view, trainerName }: { view: MessageView; trainerName: string }) {
  const label =
    view.kind === "plan_delivery"
      ? "Plan delivered"
      : view.kind === "log_confirmation"
        ? "Logged"
        : "Check-in";
  return (
    <div className="flex flex-col items-start gap-1" data-testid={`msg-${view.voice}`} data-voice={view.voice}>
      {view.label && (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground" data-testid="ai-label">
          <Sparkles className="size-3" aria-hidden="true" />
          <span>{view.label}</span>
        </div>
      )}
      <div
        data-testid="msg-card"
        className="w-full max-w-[85%] rounded-xl border bg-surface-raised p-3"
      >
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <FileText className="size-3.5" aria-hidden="true" />
          <span>{label}</span>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm text-foreground">{view.body}</p>
        <span className="sr-only">from {trainerName}</span>
      </div>
    </div>
  );
}
