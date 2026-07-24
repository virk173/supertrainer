"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Dumbbell,
  MessageSquare,
  TrendingDown,
} from "lucide-react";

import { createSupabaseBrowserClient } from "@supertrainer/db/browser";
import { Avatar } from "@supertrainer/ui/components/avatar";
import { Badge } from "@supertrainer/ui/components/badge";
import { Button } from "@supertrainer/ui/components/button";
import { cn } from "@supertrainer/ui/lib/utils";

import { refreshHomeDigestAction } from "@/app/(app)/trainer/actions";
import type { AtRiskItem, DigestClientRef, EscalationItem } from "@/lib/trainer/home";
import type { PendingBreakdown } from "@/lib/queue/count";

type Live = {
  pending: PendingBreakdown;
  escalations: EscalationItem[];
  estimatedMinutes: number;
};

function formatAge(hours: number): string {
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function NeedsYouToday({
  initialLive,
  renewals,
  atRisk,
}: {
  initialLive: Live;
  renewals: DigestClientRef[];
  atRisk: AtRiskItem[];
}) {
  const [live, setLive] = React.useState(initialLive);
  const { pending, escalations, estimatedMinutes } = live;

  // Refresh the fast-changing slice when a draft lands or an escalation resolves.
  React.useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const refresh = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        void refreshHomeDigestAction().then((next) => {
          if (!cancelled && next) setLive(next);
        });
      }, 400);
    };

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      await supabase.realtime.setAuth(data.session?.access_token);
      if (cancelled) return;
      channel = supabase
        .channel("trainer:home-digest")
        .on("postgres_changes", { event: "*", schema: "public", table: "drafts" }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "escalations" }, refresh)
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  const actionable =
    pending.total + renewals.length + atRisk.length;

  return (
    <section aria-labelledby="needs-you-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="needs-you-heading" className="text-sm font-semibold tracking-tight">
          Needs you today
        </h2>
        {pending.total > 0 && estimatedMinutes > 0 && (
          <span className="metric-label" data-testid="clear-estimate">
            ~{estimatedMinutes} min to clear
          </span>
        )}
      </div>

      {actionable === 0 ? (
        <QueueZero />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-md border bg-surface-raised">
          {escalations.map((item) => (
            <EscalationRow key={item.escalationId} item={item} />
          ))}

          {pending.replies > 0 && (
            <GroupRow
              icon={<MessageSquare />}
              title="Replies to approve"
              subtitle="Drafted in your voice"
              count={pending.replies}
              href="/trainer/queue?tab=replies"
            />
          )}
          {pending.plans > 0 && (
            <GroupRow
              icon={<ClipboardList />}
              title="Diet plans to review"
              subtitle="New and renewal drafts"
              count={pending.plans}
              href="/trainer/queue?tab=plans"
            />
          )}
          {pending.splits > 0 && (
            <GroupRow
              icon={<Dumbbell />}
              title="Training splits to review"
              subtitle="New drafts and progressions"
              count={pending.splits}
              href="/trainer/queue?tab=splits"
            />
          )}

          {renewals.length > 0 && (
            <GroupRow
              icon={<CalendarClock />}
              title="Renewals due this week"
              subtitle={`${renewals.length} client${renewals.length === 1 ? "" : "s"} completing a month`}
              count={renewals.length}
              href="/trainer/clients"
              variant="quiet"
            />
          )}

          {atRisk.map((item) => (
            <AtRiskRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}

function QueueZero() {
  return (
    <div
      data-testid="queue-zero"
      className="flex flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-surface-raised p-8 text-center"
    >
      <CheckCircle2 aria-hidden="true" className="mb-2 size-6 text-success" />
      <h3 className="text-sm font-semibold">Queue zero</h3>
      <p className="max-w-sm text-sm text-muted-foreground">
        You&rsquo;re all caught up — nothing needs you right now. Your roster keeps
        logging in the background.
      </p>
    </div>
  );
}

function EscalationRow({ item }: { item: EscalationItem }) {
  return (
    <li className="flex items-center gap-3 border-l-2 border-danger py-3 pl-3 pr-3">
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-danger" />
      <Avatar name={item.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.name}</p>
        <p className="truncate text-xs text-muted-foreground">{item.reason}</p>
      </div>
      <span className="metric shrink-0 text-xs text-muted-foreground">
        {formatAge(item.ageHours)}
      </span>
      <Button asChild size="sm">
        <Link href={`/trainer/clients/${item.id}/inbox`}>Open</Link>
      </Button>
    </li>
  );
}

function AtRiskRow({ item }: { item: AtRiskItem }) {
  return (
    <li className="flex items-center gap-3 border-l-2 border-warning py-3 pl-3 pr-3">
      <TrendingDown aria-hidden="true" className="size-4 shrink-0 text-warning-text" />
      <Avatar name={item.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.name}</p>
        <p className="truncate text-xs text-muted-foreground">{item.reason}</p>
      </div>
      <Button asChild size="sm" variant="outline">
        <Link href={`/trainer/clients/${item.id}/inbox`}>Open</Link>
      </Button>
    </li>
  );
}

function GroupRow({
  icon,
  title,
  subtitle,
  count,
  href,
  variant = "default",
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  count: number;
  href: string;
  variant?: "default" | "quiet";
}) {
  return (
    <li className="flex items-center gap-3 py-3 pl-3 pr-3">
      <span
        aria-hidden="true"
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <Badge variant="muted" className="metric tabular-nums">
        {count}
      </Badge>
      <Button asChild size="sm" variant={variant === "quiet" ? "ghost" : "outline"}>
        <Link href={href}>Review</Link>
      </Button>
    </li>
  );
}
