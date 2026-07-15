"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  MessageCircle,
  NotebookPen,
  Sun,
  User,
} from "lucide-react";

import { Avatar } from "@supertrainer/ui/components/avatar";
import { cn, focusRing } from "@supertrainer/ui/lib/utils";

import { isPathActive } from "@/lib/routes";

const TAB_ITEMS = [
  { label: "Today", href: "/portal", icon: Sun },
  { label: "Plan", href: "/portal/plan", icon: ClipboardList },
  { label: "Log", href: "/portal/log", icon: NotebookPen },
  { label: "Chat", href: "/portal/chat", icon: MessageCircle },
  { label: "Me", href: "/portal/me", icon: User },
] as const;

/*
 * Client portal chrome: a phone-shaped column (max-w-lg, centered on wider
 * screens) with a fixed five-tab bar at the bottom. `h-dvh` by default;
 * pass className="h-full" to embed (styleguide).
 */
export function PortalShell({
  children,
  className,
  embedded = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** Styleguide preview mode — renders a div instead of a main landmark. */
  embedded?: boolean;
}) {
  const pathname = usePathname();
  const Content = embedded ? "div" : "main";

  return (
    <div
      data-slot="portal-shell"
      className={cn(
        "flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground",
        className,
      )}
    >
      <header className="flex h-14 shrink-0 items-center border-b bg-surface">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between px-4">
          <span className="text-sm font-semibold tracking-tight">
            supertrainer
          </span>
          <Avatar name="Client" />
        </div>
      </header>

      <Content className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-lg p-4">{children}</div>
      </Content>

      <nav
        aria-label="Portal"
        className="shrink-0 border-t bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto flex w-full max-w-lg">
          {TAB_ITEMS.map(({ label, href, icon: Icon }) => {
            const active = isPathActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors",
                  focusRing,
                  "focus-visible:ring-inset",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-10 items-center justify-center rounded-full",
                    active && "bg-primary text-primary-foreground",
                  )}
                >
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
