"use client";

import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Link from "next/link";
import { ChevronsUpDown, LogOut, Monitor, Moon, Settings, Sun } from "lucide-react";

import { Avatar } from "@supertrainer/ui/components/avatar";
import { cn, focusRing } from "@supertrainer/ui/lib/utils";

import { signOut } from "@/app/(auth)/actions";
import { useTheme } from "@/components/theme-provider";
import { THEMES, type Theme } from "@/lib/theme";

const THEME_ICON: Record<Theme, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const menuItem =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground outline-none transition-colors data-[highlighted]:bg-secondary data-[highlighted]:text-secondary-foreground";

// Sidebar-footer identity + account menu: theme control, settings, sign out.
// `collapsed` renders the 64px icon-rail trigger (avatar only).
export function UserMenu({
  name,
  email,
  collapsed,
}: {
  name: string;
  email: string;
  collapsed: boolean;
}) {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="Account menu"
        className={cn(
          "flex w-full items-center gap-2 rounded-md p-1.5 text-left transition-colors hover:bg-foreground/5",
          focusRing,
          collapsed && "justify-center",
        )}
      >
        <Avatar name={name} />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {email}
              </span>
            </span>
            <ChevronsUpDown
              aria-hidden="true"
              className="size-3.5 shrink-0 text-muted-foreground"
            />
          </>
        )}
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={8}
          className="z-50 min-w-56 rounded-md border bg-popover p-1 text-popover-foreground shadow-sm"
        >
          <div className="px-2 py-1.5">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </div>

          <DropdownMenu.Separator className="my-1 h-px bg-border" />

          {/* Theme control — plain buttons (not Items) so choosing one keeps the
              menu open to preview the change. */}
          <div className="px-2 py-1">
            <p className="metric-label mb-1.5">Theme</p>
            <div
              role="group"
              aria-label="Theme"
              className="grid grid-cols-3 gap-1"
            >
              {THEMES.map((option) => {
                const Icon = THEME_ICON[option];
                const active = theme === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setTheme(option)}
                    aria-pressed={active}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-md border px-2 py-1.5 text-xs capitalize transition-colors",
                      focusRing,
                      active
                        ? "border-foreground/15 bg-secondary text-secondary-foreground"
                        : "border-transparent text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                    )}
                  >
                    <Icon aria-hidden="true" className="size-4" />
                    {option}
                  </button>
                );
              })}
            </div>
          </div>

          <DropdownMenu.Separator className="my-1 h-px bg-border" />

          <DropdownMenu.Item asChild>
            <Link href="/trainer/settings" className={menuItem}>
              <Settings aria-hidden="true" className="size-4 text-muted-foreground" />
              Settings
            </Link>
          </DropdownMenu.Item>

          <form action={signOut}>
            <DropdownMenu.Item asChild>
              <button type="submit" className={menuItem}>
                <LogOut aria-hidden="true" className="size-4 text-muted-foreground" />
                Sign out
              </button>
            </DropdownMenu.Item>
          </form>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
