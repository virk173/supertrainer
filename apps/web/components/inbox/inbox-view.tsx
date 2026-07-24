"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@supertrainer/ui/components/button";
import { cn, focusRing } from "@supertrainer/ui/lib/utils";

import { ThreadView, type LoadOlderAction, type MarkReadAction, type SendAction } from "@/components/chat/thread-view";
import { ClientContext } from "@/components/inbox/client-context";
import { DraftedReplyCard } from "@/components/inbox/drafted-reply-card";
import { TodoTracker } from "@/components/inbox/todo-tracker";
import type { MessageView } from "@/lib/chat/message-view";
import type { ClientInbox } from "@/lib/trainer/inbox";

type MobileTab = "thread" | "client" | "todos";

const TABS: { tab: MobileTab; label: string }[] = [
  { tab: "thread", label: "Thread" },
  { tab: "client", label: "Client" },
  { tab: "todos", label: "To-dos" },
];

// The centerpiece per-client inbox (spec §8): thread + client context + to-do
// tracker in one view. Desktop is a two-pane split; below lg it collapses to
// tabs (thread default). Every pane is rendered once — the thread's realtime
// subscription (ThreadView) must not be duplicated.
export function InboxView({
  inbox,
  trainerName,
  initialMessages,
  hasMore,
  sendAction,
  markReadAction,
  loadOlderAction,
}: {
  inbox: ClientInbox;
  trainerName: string;
  initialMessages: MessageView[];
  hasMore: boolean;
  sendAction: SendAction;
  markReadAction: MarkReadAction;
  loadOlderAction: LoadOlderAction;
}) {
  const [mobileTab, setMobileTab] = React.useState<MobileTab>("thread");
  const { clientId, clientName, status, context, todos, draft } = inbox;

  return (
    <div className="flex h-[calc(100dvh-9rem)] flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back to clients">
          <Link href="/trainer/clients">
            <ArrowLeft aria-hidden="true" className="size-4" />
          </Link>
        </Button>
        <h1 className="truncate text-lg font-semibold tracking-tight" data-testid="inbox-title">
          {clientName}
        </h1>
      </div>

      {/* Below lg, one pane at a time. */}
      <div
        role="tablist"
        aria-label="Inbox panes"
        className="flex gap-1 rounded-md border bg-surface p-1 lg:hidden"
      >
        {TABS.map(({ tab, label }) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={mobileTab === tab}
            onClick={() => setMobileTab(tab)}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
              focusRing,
              mobileTab === tab
                ? "bg-surface-raised text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Thread pane (rendered once) */}
        <div className={cn("min-h-0", mobileTab === "thread" ? "flex" : "hidden", "lg:flex")}>
          <div className="flex min-h-0 flex-1 flex-col">
            {draft && <DraftedReplyCard draft={draft} />}
            <ThreadView
              viewer="coach"
              clientId={clientId}
              initial={initialMessages}
              hasMore={hasMore}
              trainerName={trainerName}
              sendAction={sendAction}
              markReadAction={markReadAction}
              loadOlderAction={loadOlderAction}
              emptyHint={`No messages with ${clientName} yet.`}
            />
          </div>
        </div>

        {/* Right rail: context (top) + to-dos (bottom) */}
        <div
          className={cn(
            "min-h-0 space-y-4 overflow-y-auto",
            mobileTab === "thread" ? "hidden lg:block" : "block",
          )}
        >
          <div className={cn(mobileTab === "client" ? "block" : "hidden", "lg:block")}>
            <ClientContext
              clientId={clientId}
              clientName={clientName}
              status={status}
              context={context}
            />
          </div>
          <div className={cn(mobileTab === "todos" ? "block" : "hidden", "lg:block")}>
            <TodoTracker clientId={clientId} clientName={clientName} todos={todos} />
          </div>
        </div>
      </div>
    </div>
  );
}
