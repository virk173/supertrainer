"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Camera,
  ClipboardList,
  Globe,
  MessageCircle,
  Music,
  NotebookPen,
  Sun,
  User,
  Video,
} from "lucide-react";

import { Avatar } from "@supertrainer/ui/components/avatar";
import type { SocialPlatform } from "@supertrainer/ui/lib/brand";
import { cn, focusRing } from "@supertrainer/ui/lib/utils";

import { isPathActive } from "@/lib/routes";

// This lucide build ships no brand marks — map socials to generic glyphs.
const SOCIAL_ICON: Record<
  SocialPlatform,
  React.ComponentType<{ className?: string }>
> = {
  instagram: Camera,
  youtube: Video,
  tiktok: Music,
  website: Globe,
};

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
  brandName,
  socials = [],
}: {
  children: React.ReactNode;
  className?: string;
  /** Styleguide preview mode — renders a div instead of a main landmark. */
  embedded?: boolean;
  /** Trainer/org display name for the footer (spec §11: socials on portal). */
  brandName?: string;
  /** Trainer social links rendered in the footer. */
  socials?: { platform: SocialPlatform; href: string }[];
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
        {(brandName || socials.length > 0) && (
          <footer
            data-testid="portal-brand-footer"
            className="mx-auto flex w-full max-w-lg flex-col items-center gap-2 px-4 pb-6 pt-4 text-center"
          >
            {socials.length > 0 && (
              <div className="flex items-center gap-4 text-muted-foreground">
                {socials.map(({ platform, href }) => {
                  const Icon = SOCIAL_ICON[platform];
                  return (
                    <a
                      key={platform}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      aria-label={`${brandName ?? "Coach"} on ${platform}`}
                      className={cn(
                        "rounded-md transition-colors hover:text-foreground",
                        focusRing,
                      )}
                    >
                      <Icon className="size-4" />
                    </a>
                  );
                })}
              </div>
            )}
            {brandName && (
              <p className="text-[11px] text-muted-foreground">
                Coached by{" "}
                <span className="font-medium text-foreground">{brandName}</span>
              </p>
            )}
          </footer>
        )}
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
