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
  Rocket,
  Settings,
  UserSearch,
  Users,
  X,
} from "lucide-react";

import { Avatar } from "@supertrainer/ui/components/avatar";
import { cn, focusRing } from "@supertrainer/ui/lib/utils";

import { isPathActive } from "@/lib/routes";

const NAV_ITEMS = [
  { label: "Home", href: "/trainer", icon: Home },
  { label: "Prospects", href: "/trainer/prospects", icon: UserSearch },
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
  resumeOnboarding = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** Styleguide preview mode — renders a div instead of a main landmark. */
  embedded?: boolean;
  /** Show the "finish setup" banner — true while onboarding steps remain. */
  resumeOnboarding?: boolean;
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
            className={cn(
              "rounded-md text-sm font-semibold tracking-tight",
              focusRing,
            )}
          >
            <span className={cn(collapsed ? "" : "md:hidden")}>st</span>
            {!collapsed && (
              <span className="hidden md:inline">supertrainer</span>
            )}
          </Link>
        </div>

        <nav aria-label="Primary" className="flex-1 space-y-1 p-2">
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
            const active = isPathActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                title={label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  focusRing,
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                  "justify-center px-2",
                  !collapsed && "md:justify-start md:px-3",
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
              "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground",
              focusRing,
              "justify-center px-2",
              !collapsed && "md:justify-start md:px-3",
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
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors hover:bg-foreground/5",
              focusRing,
            )}
          >
            <span className="truncate">My coaching org</span>
            <ChevronsUpDown
              aria-hidden="true"
              className="size-3.5 text-muted-foreground"
            />
          </button>
          <Avatar name="Trainer" />
        </header>

        {resumeOnboarding && <ResumeBanner />}

        <Content className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl p-6">{children}</div>
        </Content>
      </div>
    </div>
  );
}

const RESUME_DISMISS_KEY = "st.onboarding.resume-dismissed";

/*
 * Resume-setup nudge, shown while onboarding steps remain. Dismissible: the
 * choice is remembered in localStorage so it stays closed across reloads, but
 * the server stops passing resumeOnboarding once every step is resolved, so a
 * completed checklist never renders this at all.
 */
function ResumeBanner() {
  const [dismissed, setDismissed] = React.useState(true);

  React.useEffect(() => {
    setDismissed(
      window.localStorage.getItem(RESUME_DISMISS_KEY) === "true",
    );
  }, []);

  if (dismissed) return null;

  return (
    <div
      data-testid="resume-onboarding-banner"
      className="flex items-center gap-3 border-b bg-surface px-4 py-2.5 text-sm"
    >
      <Rocket aria-hidden="true" className="size-4 shrink-0 text-success" />
      <p className="min-w-0 flex-1 truncate text-muted-foreground">
        <span className="font-medium text-foreground">Finish setting up.</span>{" "}
        A few steps remain before your workspace is fully activated.
      </p>
      <Link
        href="/onboarding"
        className={cn(
          "shrink-0 rounded-md px-2.5 py-1 text-sm font-medium text-primary hover:underline",
          focusRing,
        )}
      >
        Resume
      </Link>
      <button
        type="button"
        onClick={() => {
          window.localStorage.setItem(RESUME_DISMISS_KEY, "true");
          setDismissed(true);
        }}
        aria-label="Dismiss setup reminder"
        className={cn(
          "shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground",
          focusRing,
        )}
        data-testid="dismiss-resume-banner"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
