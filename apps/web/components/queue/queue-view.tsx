"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ClipboardList,
  CornerDownLeft,
  Dumbbell,
  Flag,
  MessageSquare,
  TrendingUp,
} from "lucide-react";

import { createSupabaseBrowserClient } from "@supertrainer/db/browser";
import { Avatar } from "@supertrainer/ui/components/avatar";
import { Badge } from "@supertrainer/ui/components/badge";
import { Button } from "@supertrainer/ui/components/button";
import { cn, focusRing } from "@supertrainer/ui/lib/utils";

import {
  approveDraftJson,
  dismissDraftJson,
  editDraftJson,
  refreshQueueAction,
  reopenEscalationJson,
  resolveEscalationJson,
  rewriteDraftJson,
  undismissDraftJson,
} from "@/app/(app)/trainer/queue/actions";
import {
  itemsForTab,
  QUEUE_TABS,
  type QueueCounts,
  type QueueItem,
  type QueueItemType,
  type QueueTab,
} from "@/lib/trainer/queue-types";

const TYPE_ICON: Record<QueueItemType, typeof MessageSquare> = {
  reply: MessageSquare,
  plan: ClipboardList,
  split: Dumbbell,
  progression: TrendingUp,
  escalation: AlertTriangle,
  flag: Flag,
};

function ageLabel(hours: number): string {
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

// SLA color: an item waiting too long earns a warning, then a danger, tint. Only
// status color on the queue — the chrome stays achromatic.
function ageClass(item: QueueItem): string {
  if (item.type === "escalation" || item.ageHours >= 48) return "text-danger";
  if (item.ageHours >= 24) return "text-warning-text";
  return "text-muted-foreground";
}

type Undo = { item: QueueItem; kind: "dismiss" | "resolve" } | null;

export function QueueView({
  tab,
  initialItems,
  initialCounts,
}: {
  tab: QueueTab;
  initialItems: QueueItem[];
  initialCounts: QueueCounts;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [items, setItems] = React.useState(initialItems);
  const [counts, setCounts] = React.useState(initialCounts);
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
  const [cleared, setCleared] = React.useState(0);
  const [undo, setUndo] = React.useState<Undo>(null);
  const undoTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const editRef = React.useRef<HTMLTextAreaElement>(null);

  const visible = React.useMemo(() => itemsForTab(items, tab), [items, tab]);
  const selected = visible.find((i) => i.key === selectedKey) ?? null;
  const selectedIndex = visible.findIndex((i) => i.key === selectedKey);

  // Keep a valid selection as the list changes.
  React.useEffect(() => {
    if (visible.length === 0) {
      setSelectedKey(null);
    } else if (!visible.some((i) => i.key === selectedKey)) {
      setSelectedKey(visible[0]!.key);
    }
  }, [visible, selectedKey]);

  // Realtime: any queue stream changes → recompute (debounced).
  React.useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const refresh = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        void refreshQueueAction().then((next) => {
          if (!cancelled && next) {
            setItems(next.items);
            setCounts(next.counts);
          }
        });
      }, 400);
    };

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      await supabase.realtime.setAuth(data.session?.access_token);
      if (cancelled) return;
      channel = supabase.channel("trainer:queue");
      for (const table of ["drafts", "escalations", "plans", "splits"]) {
        channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
      }
      channel.subscribe();
    })();

    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  const scheduleUndo = React.useCallback((next: Undo) => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo(next);
    undoTimer.current = setTimeout(() => setUndo(null), 5000);
  }, []);

  // Optimistically drop an item and advance selection to the next one.
  const removeItem = React.useCallback(
    (key: string) => {
      setItems((prev) => prev.filter((i) => i.key !== key));
      setCleared((c) => c + 1);
      const idx = visible.findIndex((i) => i.key === key);
      const next = visible[idx + 1] ?? visible[idx - 1] ?? null;
      setSelectedKey(next && next.key !== key ? next.key : null);
    },
    [visible],
  );

  // On a failed mutation, re-pull the queue so an optimistically-removed item
  // that didn't actually change is restored (approve/edit have no undo).
  const resync = React.useCallback(async () => {
    const next = await refreshQueueAction();
    if (next) {
      setItems(next.items);
      setCounts(next.counts);
    }
  }, []);

  const onApprove = React.useCallback(
    async (item: QueueItem, text?: string) => {
      removeItem(item.key);
      try {
        const result =
          text !== undefined
            ? await editDraftJson(item.id, text)
            : await approveDraftJson(item.id);
        if (!result.ok) await resync();
      } catch {
        await resync();
      }
    },
    [removeItem, resync],
  );

  const onDismiss = React.useCallback(
    async (item: QueueItem) => {
      removeItem(item.key);
      scheduleUndo({ item, kind: "dismiss" });
      try {
        const result = await dismissDraftJson(item.id);
        if (!result.ok) await resync();
      } catch {
        await resync();
      }
    },
    [removeItem, scheduleUndo, resync],
  );

  const onResolve = React.useCallback(
    async (item: QueueItem) => {
      removeItem(item.key);
      scheduleUndo({ item, kind: "resolve" });
      try {
        const result = await resolveEscalationJson(item.id);
        if (!result.ok) await resync();
      } catch {
        await resync();
      }
    },
    [removeItem, scheduleUndo, resync],
  );

  const onRewrite = React.useCallback(async (item: QueueItem) => {
    await rewriteDraftJson(item.id);
  }, []);

  const onUndo = React.useCallback(async () => {
    if (!undo) return;
    const { item, kind } = undo;
    setUndo(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setItems((prev) => (prev.some((i) => i.key === item.key) ? prev : [item, ...prev]));
    setCleared((c) => Math.max(0, c - 1));
    if (kind === "dismiss") await undismissDraftJson(item.id);
    else await reopenEscalationJson(item.id);
  }, [undo]);

  // Keyboard: j/k navigate, enter opens (review) or focuses edit, a approves a
  // reply, e focuses the editor. Ignored while typing in a field.
  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        const next = visible[Math.min(selectedIndex + 1, visible.length - 1)];
        if (next) setSelectedKey(next.key);
      } else if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        const prev = visible[Math.max(selectedIndex - 1, 0)];
        if (prev) setSelectedKey(prev.key);
      } else if (event.key === "Enter" && selected) {
        if (selected.type === "reply") editRef.current?.focus();
        else if (selected.reviewHref) router.push(selected.reviewHref);
      } else if (event.key === "a" && selected?.type === "reply") {
        event.preventDefault();
        void onApprove(selected);
      } else if (event.key === "e" && selected?.type === "reply") {
        event.preventDefault();
        editRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, selectedIndex, selected, router, onApprove]);

  function tabHref(next: QueueTab): string {
    return `${pathname}?tab=${next}`;
  }

  return (
    <div className="space-y-4" data-testid="queue-view">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight" data-testid="queue-home">
          Review queue
        </h1>
        {cleared > 0 && (
          <span className="metric-label" data-testid="cleared-count">
            Cleared {cleared} this session
          </span>
        )}
      </div>

      {/* Tabs — URL state, live counts. */}
      <nav
        aria-label="Queue filters"
        className="flex flex-wrap gap-1 border-b pb-px"
      >
        {QUEUE_TABS.map(({ tab: t, label }) => {
          const active = t === tab;
          const count = counts[t];
          return (
            <Link
              key={t}
              href={tabHref(t)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                focusRing,
                active
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
              )}
            >
              {label}
              {count > 0 && (
                <span className="metric text-xs text-muted-foreground">{count}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {undo && (
        <div
          data-testid="undo-bar"
          className="flex items-center justify-between gap-3 rounded-md border bg-surface px-3 py-2 text-sm"
        >
          <span className="text-muted-foreground">
            {undo.kind === "dismiss" ? "Draft dismissed." : "Escalation resolved."}
          </span>
          <Button size="sm" variant="ghost" onClick={onUndo} data-testid="undo-button">
            Undo
          </Button>
        </div>
      )}

      {visible.length === 0 ? (
        <QueueZero tab={tab} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          {/* List */}
          <ul
            className="divide-y divide-border overflow-hidden rounded-md border bg-surface-raised"
            data-testid="queue-list"
          >
            {visible.map((item) => {
              const Icon = TYPE_ICON[item.type];
              const active = item.key === selectedKey;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => setSelectedKey(item.key)}
                    aria-current={active ? "true" : undefined}
                    data-testid="queue-row"
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-3 text-left transition-colors",
                      focusRing,
                      active ? "bg-foreground/5" : "hover:bg-foreground/5",
                    )}
                  >
                    <Icon
                      aria-hidden="true"
                      className={cn(
                        "size-4 shrink-0",
                        item.type === "escalation" ? "text-danger" : "text-muted-foreground",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.clientName}</p>
                      <p className="truncate text-xs text-muted-foreground">{item.preview}</p>
                    </div>
                    <span className={cn("metric shrink-0 text-xs", ageClass(item))}>
                      {ageLabel(item.ageHours)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Detail */}
          <div className="rounded-md border bg-surface-raised p-4" data-testid="queue-detail">
            {selected ? (
              <QueueDetail
                item={selected}
                editRef={editRef}
                onApprove={onApprove}
                onDismiss={onDismiss}
                onResolve={onResolve}
                onRewrite={onRewrite}
              />
            ) : (
              <p className="p-4 text-sm text-muted-foreground">
                Select an item to review it here.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function QueueZero({ tab }: { tab: QueueTab }) {
  return (
    <div
      data-testid="queue-zero"
      className="flex flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-surface-raised p-10 text-center"
    >
      <CornerDownLeft aria-hidden="true" className="mb-2 size-6 text-success" />
      <h3 className="text-sm font-semibold">
        {tab === "all" ? "Queue zero" : "Nothing here"}
      </h3>
      <p className="max-w-sm text-sm text-muted-foreground">
        {tab === "all"
          ? "Everything's approved. Your roster keeps logging in the background."
          : "No items in this filter right now."}
      </p>
    </div>
  );
}

function QueueDetail({
  item,
  editRef,
  onApprove,
  onDismiss,
  onResolve,
  onRewrite,
}: {
  item: QueueItem;
  editRef: React.RefObject<HTMLTextAreaElement | null>;
  onApprove: (item: QueueItem, text?: string) => void;
  onDismiss: (item: QueueItem) => void;
  onResolve: (item: QueueItem) => void;
  onRewrite: (item: QueueItem) => void;
}) {
  const [text, setText] = React.useState(item.draftText ?? "");
  React.useEffect(() => setText(item.draftText ?? ""), [item.key, item.draftText]);

  const header = (
    <div className="mb-3 flex items-center gap-3">
      <Avatar name={item.clientName} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{item.clientName}</p>
        <p className="truncate text-xs text-muted-foreground">{item.preview}</p>
      </div>
    </div>
  );

  if (item.type === "reply") {
    const edited = text.trim() !== (item.draftText ?? "").trim();
    return (
      <div>
        {header}
        {item.triggerText && (
          <p className="mb-3 rounded-md bg-surface p-2 text-sm text-muted-foreground" data-testid="reply-trigger">
            {item.triggerText}
          </p>
        )}
        <textarea
          ref={editRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          aria-label="Draft reply"
          data-testid="reply-editor"
          className={cn(
            "w-full rounded-md border bg-background p-2 text-sm",
            focusRing,
          )}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            onClick={() => onApprove(item, edited ? text : undefined)}
            data-testid="reply-approve"
          >
            {edited ? "Send edit" : "Approve & send"}
          </Button>
          <Button variant="outline" onClick={() => onRewrite(item)}>
            Rewrite
          </Button>
          <Button variant="ghost" onClick={() => onDismiss(item)} data-testid="reply-dismiss">
            Dismiss
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Sending is immediate and can&rsquo;t be undone. Dismiss can.
        </p>
      </div>
    );
  }

  if (item.type === "escalation") {
    return (
      <div>
        {header}
        {item.categories && item.categories.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {item.categories.map((c) => (
              <Badge key={c} variant="muted">
                {c.replace(/_/g, " ")}
              </Badge>
            ))}
          </div>
        )}
        {item.excerpt && (
          <blockquote className="mb-3 border-l-2 border-danger pl-3 text-sm text-muted-foreground">
            {item.excerpt}
          </blockquote>
        )}
        <p className="mb-3 text-sm text-muted-foreground">
          This was never auto-answered — a holding line was sent. Reply personally.
        </p>
        <div className="flex flex-wrap gap-2">
          {item.reviewHref && (
            <Button asChild>
              <Link href={item.reviewHref}>Reply personally</Link>
            </Button>
          )}
          <Button variant="outline" onClick={() => onResolve(item)} data-testid="escalation-resolve">
            Resolve
          </Button>
        </div>
      </div>
    );
  }

  // plan / split / progression / flag — the full editor lives on its own route.
  return (
    <div>
      {header}
      {item.needsAttention && (
        <Badge variant="warning" className="mb-3">
          Needs attention
        </Badge>
      )}
      <p className="mb-3 text-sm text-muted-foreground">
        {item.type === "flag"
          ? "This client hasn't finished onboarding. Open their profile to nudge them."
          : "Open the full editor to review portions, volume, and approve or send back with a note."}
      </p>
      {item.reviewHref && (
        <Button asChild>
          <Link href={item.reviewHref}>
            {item.type === "flag" ? "Open client" : "Open full review"}
          </Link>
        </Button>
      )}
    </div>
  );
}
