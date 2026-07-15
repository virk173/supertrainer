"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronsUpDown,
  ClipboardList,
  Home,
  Inbox,
  ListChecks,
  PanelLeft,
  Settings,
  Users,
} from "lucide-react";

import { Avatar } from "@supertrainer/ui/components/avatar";
import { cn } from "@supertrainer/ui/lib/utils";

const NAV_ITEMS = [
  { label: "Home", href: "/trainer", icon: Home },
  { label: "Inbox", href: "/trainer/inbox", icon: Inbox },
  { label: "Clients", href: "/trainer/clients", icon: Users },
  { label: "Plans", href: "/trainer/plans", icon: ClipboardList },
  { label: "Queue", href: "/trainer/queue", icon: ListChecks },
  { label: "Settings", href: "/trainer/settings", icon: Settings },
] as const;

/*
 * Trainer workspace chrome: quiet gray sidebar, the active item as a solid
 * ink chip — color in the content area is reserved for adherence state.
 * `h-dvh` by default; pass className="h-full" to embed (styleguide).
 */
export function TrainerShell({
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
  const [collapsed, setCollapsed] = React.useState(false);
  const Content = embedded ? "div" : "main";

  return (
    <div
      data-slot="trainer-shell"
      className={cn(
        "flex h-dvh w-full overflow-hidden bg-background text-foreground",
        className,
      )}
    >
      {/* Below md the sidebar is always an icon rail; the toggle matters from md up. */}
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r bg-surface text-surface-foreground transition-[width] duration-200",
          collapsed ? "w-16" : "w-16 md:w-60",
        )}
      >
        <div
          className={cn(
            "flex h-14 items-center border-b px-4",
            collapsed ? "justify-center px-2" : "justify-center md:justify-start",
          )}
        >
          <Link
            href="/trainer"
            className="rounded-md text-sm font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <span className={cn(collapsed ? "" : "md:hidden")}>st</span>
            {!collapsed && (
              <span className="hidden md:inline">supertrainer</span>
            )}
          </Link>
        </div>

        <nav aria-label="Primary" className="flex-1 space-y-1 p-2">
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
            const active =
              href === "/trainer"
                ? pathname === "/trainer"
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                title={label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                  collapsed
                    ? "justify-center px-2"
                    : "justify-center px-2 md:justify-start md:px-3",
                )}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                {!collapsed && (
                  <span className="hidden truncate md:inline">{label}</span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t p-2">
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              collapsed
                ? "justify-center px-2"
                : "justify-center px-2 md:justify-start md:px-3",
            )}
          >
            <PanelLeft aria-hidden="true" className="size-4 shrink-0" />
            {!collapsed && <span className="hidden md:inline">Collapse</span>}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
          {/* Org switching arrives with multi-org support — placeholder control. */}
          <button
            type="button"
            title="Org switching arrives in a later phase"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <span className="truncate">My coaching org</span>
            <ChevronsUpDown
              aria-hidden="true"
              className="size-3.5 text-muted-foreground"
            />
          </button>
          <Avatar name="Trainer" />
        </header>

        <Content className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl p-6">{children}</div>
        </Content>
      </div>
    </div>
  );
}
