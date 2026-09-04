import { notFound } from "next/navigation";
import Link from "next/link";

import { cn, focusRing } from "@supertrainer/ui/lib/utils";

import { AdminUnlock } from "@/components/admin/unlock";
import { LockButton } from "@/components/admin/lock-button";
import { adminIdentity } from "@/lib/admin/guard";

export const metadata = { title: "Platform — supertrainer", robots: { index: false, follow: false } };

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/orgs", label: "Orgs" },
  { href: "/admin/flags", label: "Flags" },
  { href: "/admin/incidents", label: "Incidents" },
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const identity = await adminIdentity();
  // Not an operator → the console does not exist. Invisible beats forbidden:
  // a 404 tells a prober nothing about what lives here.
  if (!identity) notFound();

  if (!identity.elevated) {
    return (
      <main className="mx-auto w-full max-w-md px-6 py-24">
        <AdminUnlock hasCredential={identity.hasCredential} />
      </main>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-4 px-6 py-3">
          <span className="text-sm font-semibold tracking-tight">Platform</span>
          <nav aria-label="Platform console" className="flex flex-wrap items-center gap-1">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground",
                  focusRing,
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Unlocked for 30 min</span>
            <LockButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
