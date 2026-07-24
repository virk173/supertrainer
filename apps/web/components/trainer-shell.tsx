"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ChevronRight,
  PanelLeft,
  Plus,
  Rocket,
  Search,
  UserPlus,
  X,
} from "lucide-react";

import { createSupabaseBrowserClient } from "@supertrainer/db/browser";
import { Badge } from "@supertrainer/ui/components/badge";
import { cn, focusRing } from "@supertrainer/ui/lib/utils";

import { CommandPalette } from "@/components/command-palette";
import { UserMenu } from "@/components/user-menu";
import { isPathActive } from "@/lib/routes";
import {
  breadcrumbsFor,
  PRIMARY_NAV,
  SECONDARY_NAV,
  type NavItem,
} from "@/lib/trainer-nav";

const SIDEBAR_COOKIE = "st.sidebar";

/*
 * Trainer workspace chrome (Phase 7.1). Achromatic sidebar + topbar; the active
 * nav item is the one ink chip. Sidebar collapses 256px → 64px icon rail (state
 * persisted to a cookie so the server renders the right width — no flash). ⌘K
 * opens the command palette. `h-dvh` by default; pass className="h-full" +
 * embedded to preview inside the styleguide.
 */
export function TrainerShell({
  children,
  className,
  embedded = false,
  resumeOnboarding = false,
  initialCollapsed = false,
  pendingCount = 0,
  orgName = "My coaching org",
  userName = "Trainer",
  userEmail = "",
}: {
  children: React.ReactNode;
  className?: string;
  /** Styleguide preview mode — renders a div instead of a main landmark and
   *  skips the realtime subscription + global ⌘K listener. */
  embedded?: boolean;
  /** Show the "finish setup" banner while onboarding steps remain. */
  resumeOnboarding?: boolean;
  /** Server-read collapse state (cookie) so the rail width has no hydration flash. */
  initialCollapsed?: boolean;
  pendingCount?: number;
  orgName?: string;
  userName?: string;
  userEmail?: string;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(initialCollapsed);
  const [pending, setPending] = React.useState(pendingCount);
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  const Content = embedded ? "div" : "main";
  const crumbs = breadcrumbsFor(pathname);

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"};path=/;max-age=31536000;samesite=lax`;
      return next;
    });
  }

  // Global ⌘K / Ctrl+K → open the palette.
  React.useEffect(() => {
    if (embedded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [embedded]);

  // Live pending-queue count: recount on any drafts/escalations change. RLS
  // scopes both to the trainer's org (setAuth before subscribe, per P6 pattern).
  React.useEffect(() => {
    if (embedded) return;
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    async function recount() {
      // RLS scopes each count to the trainer's org (staff read policies). Plans
      // and splits aren't in the realtime publication yet (they land in 7.3), so
      // their counts refresh whenever a drafts/escalations event triggers a
      // recount, or on the next navigation — accurate on load either way.
      const [drafts, plans, splits, escalations] = await Promise.all([
        supabase
          .from("drafts")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("plans")
          .select("id", { count: "exact", head: true })
          .eq("status", "draft"),
        supabase
          .from("splits")
          .select("id", { count: "exact", head: true })
          .eq("status", "draft"),
        supabase
          .from("escalations")
          .select("id", { count: "exact", head: true })
          .neq("status", "resolved"),
      ]);
      if (!cancelled) {
        setPending(
          (drafts.count ?? 0) +
            (plans.count ?? 0) +
            (splits.count ?? 0) +
            (escalations.count ?? 0),
        );
      }
    }

    const scheduleRecount = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => void recount(), 300);
    };

    let channel: ReturnType<typeof supabase.channel> | null = null;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      await supabase.realtime.setAuth(data.session?.access_token);
      if (cancelled) return;
      channel = supabase
        .channel("trainer:queue-count")
        .on("postgres_changes", { event: "*", schema: "public", table: "drafts" }, scheduleRecount)
        .on("postgres_changes", { event: "*", schema: "public", table: "escalations" }, scheduleRecount)
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [embedded]);

  return (
    <div
      data-slot="trainer-shell"
      className={cn(
        "flex h-dvh w-full overflow-hidden bg-background text-foreground",
        className,
      )}
    >
      {!embedded && (
        <a
          href="#trainer-main"
          className={cn(
            "sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:absolute focus:left-3 focus:top-3",
            focusRing,
          )}
        >
          Skip to content
        </a>
      )}

      {/* Below md the sidebar is always a 64px icon rail; the collapse toggle
          takes over from md up. */}
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r bg-surface text-surface-foreground transition-[width] duration-200",
          collapsed ? "w-16" : "w-16 md:w-64",
        )}
      >
        <div
          className={cn(
            "flex h-14 shrink-0 items-center border-b px-3",
            collapsed ? "justify-center" : "justify-center md:justify-start",
          )}
        >
          <Link
            href="/trainer"
            aria-label={orgName}
            className={cn(
              "flex items-center gap-2 rounded-md py-1 text-sm font-semibold tracking-tight",
              focusRing,
            )}
          >
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground"
            >
              {orgName.trim().charAt(0).toUpperCase() || "S"}
            </span>
            <span className={cn("truncate", collapsed ? "sr-only" : "sr-only md:not-sr-only")}>
              {orgName}
            </span>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <nav aria-label="Primary" className="space-y-1">
            {PRIMARY_NAV.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isPathActive(pathname, item.href)}
                collapsed={collapsed}
                badgeCount={item.badge ? pending : 0}
              />
            ))}
          </nav>

          <hr className="my-2 border-border" />

          <nav aria-label="Secondary" className="space-y-1">
            {SECONDARY_NAV.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isPathActive(pathname, item.href)}
                collapsed={collapsed}
                badgeCount={0}
              />
            ))}
          </nav>
        </div>

        <div className="shrink-0 space-y-1 border-t p-2">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "hidden w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground md:flex",
              focusRing,
              collapsed && "md:justify-center md:px-2",
            )}
          >
            <PanelLeft aria-hidden="true" className="size-4 shrink-0" />
            <span className={cn("truncate", collapsed ? "sr-only" : "")}>
              Collapse
            </span>
          </button>
          <UserMenu name={userName} email={userEmail} collapsed={collapsed} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
          <nav
            aria-label="Breadcrumb"
            className="flex min-w-0 flex-1 items-center gap-1 text-sm"
          >
            {crumbs.map((crumb, index) => {
              const last = index === crumbs.length - 1;
              return (
                <React.Fragment key={crumb.href}>
                  {index > 0 && (
                    <ChevronRight
                      aria-hidden="true"
                      className="hidden size-3.5 shrink-0 text-muted-foreground sm:block"
                    />
                  )}
                  {last ? (
                    <span
                      aria-current="page"
                      className="truncate font-medium text-foreground"
                    >
                      {crumb.label}
                    </span>
                  ) : (
                    <Link
                      href={crumb.href}
                      className={cn(
                        "hidden shrink-0 rounded text-muted-foreground transition-colors hover:text-foreground sm:block",
                        focusRing,
                      )}
                    >
                      {crumb.label}
                    </Link>
                  )}
                </React.Fragment>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="Search or jump to (Command K)"
            aria-keyshortcuts="Meta+K Control+K"
            className={cn(
              "flex h-9 items-center gap-2 rounded-md border bg-surface px-2 text-sm text-muted-foreground transition-colors hover:bg-foreground/5 sm:w-64",
              focusRing,
            )}
          >
            <Search aria-hidden="true" className="size-4 shrink-0" />
            <span className="hidden sm:inline">Search or jump to…</span>
            <kbd className="ml-auto hidden rounded border bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground md:inline">
              ⌘K
            </kbd>
          </button>

          <QuickActions />
        </header>

        {resumeOnboarding && <ResumeBanner />}

        <Content
          id={embedded ? undefined : "trainer-main"}
          className="flex-1 overflow-y-auto"
        >
          <div className="mx-auto w-full max-w-6xl p-6">{children}</div>
        </Content>
      </div>

      {!embedded && (
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      )}
    </div>
  );
}

// One sidebar row. The label stays in the a11y tree via `sr-only` when the rail
// is collapsed, so icon-only nav still has accessible names.
function NavLink({
  item,
  active,
  collapsed,
  badgeCount,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  badgeCount: number;
}) {
  const Icon = item.icon;
  const showBadge = badgeCount > 0;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        focusRing,
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
        collapsed ? "justify-center px-2" : "md:justify-start",
        !collapsed && "justify-center px-2 md:px-3",
      )}
    >
      <span className="relative shrink-0">
        <Icon aria-hidden="true" className="size-4" />
        {/* Rail mode: a dot on the icon signals pending work the label can't. */}
        {showBadge && collapsed && (
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 size-2 rounded-full bg-foreground ring-2 ring-surface"
          />
        )}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          collapsed ? "sr-only" : "sr-only md:not-sr-only",
        )}
      >
        {item.label}
      </span>
      {showBadge && (
        <Badge
          variant={active ? "secondary" : "muted"}
          className={cn(
            "metric shrink-0 tabular-nums",
            collapsed ? "sr-only" : "sr-only md:not-sr-only",
          )}
        >
          {badgeCount > 99 ? "99+" : badgeCount}
        </Badge>
      )}
    </Link>
  );
}

const quickItem =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground outline-none transition-colors data-[highlighted]:bg-secondary data-[highlighted]:text-secondary-foreground";

// Topbar "+ New" — the two most common create paths, one menu.
function QuickActions() {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="New"
        className={cn(
          "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
          focusRing,
        )}
      >
        <Plus aria-hidden="true" className="size-4" />
        <span className="hidden sm:inline">New</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-48 rounded-md border bg-popover p-1 text-popover-foreground shadow-sm"
        >
          <DropdownMenu.Item asChild>
            <Link href="/trainer/prospects" className={quickItem}>
              <UserPlus aria-hidden="true" className="size-4 text-muted-foreground" />
              Invite a client
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href="/trainer/clients" className={quickItem}>
              <Plus aria-hidden="true" className="size-4 text-muted-foreground" />
              New plan
            </Link>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
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
    setDismissed(window.localStorage.getItem(RESUME_DISMISS_KEY) === "true");
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
