import Link from "next/link";
import {
  CalendarClock,
  CheckCircle2,
  CreditCard,
  FileWarning,
  NotebookPen,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@supertrainer/ui/lib/utils";

import type { InboxTodos } from "@/lib/trainer/inbox";

type Row = {
  key: string;
  icon: LucideIcon;
  text: string;
  tone: "warning" | "danger" | "neutral";
  href?: string;
  action?: string;
};

// The per-client to-do tracker: renewals, missed-log flags, onboarding/consent
// stalls, failed payments (P8 stub). Each row states what's wrong and links to
// the fix; a clean client shows the all-clear.
export function TodoTracker({
  clientId,
  clientName,
  todos,
}: {
  clientId: string;
  clientName: string;
  todos: InboxTodos;
}) {
  const rows: Row[] = [];

  if (todos.renewalDays !== null && todos.renewalDays <= 7) {
    const overdue = todos.renewalDays < 0;
    rows.push({
      key: "renewal",
      icon: CalendarClock,
      text: overdue
        ? `Plan renewal overdue by ${-todos.renewalDays}d`
        : todos.renewalDays === 0
          ? "Plan renewal due today"
          : `Plan renewal in ${todos.renewalDays}d`,
      tone: overdue || todos.renewalDays <= 2 ? "warning" : "neutral",
      href: `/trainer/clients/${clientId}`,
      action: "Review",
    });
  }

  if (todos.lastLogDays !== null && todos.lastLogDays >= 3) {
    rows.push({
      key: "missed-log",
      icon: FileWarning,
      text: `No logs in ${todos.lastLogDays} days`,
      tone: todos.lastLogDays >= 5 ? "danger" : "warning",
    });
  }

  if (todos.onboardingStalled) {
    rows.push({
      key: "onboarding",
      icon: NotebookPen,
      text: "Onboarding not finished",
      tone: "warning",
      href: `/trainer/clients/${clientId}`,
      action: "Open",
    });
  }

  if (todos.consentPending) {
    rows.push({
      key: "consent",
      icon: FileWarning,
      text: "Consent not signed yet",
      tone: "warning",
    });
  }

  if (todos.paymentFailed) {
    rows.push({
      key: "payment",
      icon: CreditCard,
      text: "Payment failed",
      tone: "danger",
    });
  }

  return (
    <section
      aria-labelledby="todo-heading"
      className="rounded-md border bg-surface-raised"
      data-testid="todo-tracker"
    >
      <h2
        id="todo-heading"
        className="border-b px-4 py-3 text-sm font-semibold tracking-tight"
      >
        To-do
      </h2>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-1 p-6 text-center">
          <CheckCircle2 aria-hidden="true" className="mb-1 size-5 text-success" />
          <p className="text-sm text-muted-foreground">
            Nothing needs attention for {clientName}.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => {
            const Icon = row.icon;
            return (
              <li key={row.key} className="flex items-center gap-3 px-4 py-3">
                <Icon
                  aria-hidden="true"
                  className={cn(
                    "size-4 shrink-0",
                    row.tone === "danger"
                      ? "text-danger"
                      : row.tone === "warning"
                        ? "text-warning-text"
                        : "text-muted-foreground",
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-sm">{row.text}</span>
                {row.href && row.action && (
                  <Link
                    href={row.href}
                    className="shrink-0 text-sm font-medium text-primary hover:underline"
                  >
                    {row.action}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
