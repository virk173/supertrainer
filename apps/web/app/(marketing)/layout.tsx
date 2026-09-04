import Link from "next/link";
import { Archivo } from "next/font/google";

import { cn, focusRing } from "@supertrainer/ui/lib/utils";

// Phase 9.5 — the public site.
//
// It deliberately looks like the product: the same achromatic surfaces, the same
// one radius, the same rule that color states a fact rather than decorating one.
// The category's marketing is gradient-heavy and looks nothing like the software
// it sells; matching our own app is the more useful signal, and it means the
// first screen a coach sees after signing up is not a bait-and-switch.
//
// What changes for the marketing register is SCALE: a display face (Archivo,
// tight) at sizes the console never uses, and long-form measure for prose.

const display = Archivo({
  variable: "--font-marketing-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const NAV = [
  { href: "/pricing", label: "Pricing" },
  { href: "/switch", label: "Switching" },
  { href: "/security", label: "Security" },
  { href: "/docs/data", label: "Your data" },
] as const;

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn(display.variable, "min-h-dvh bg-background")}>
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
          <Link
            href="/"
            className={cn("font-display text-base font-semibold tracking-tight", focusRing)}
          >
            supertrainer
          </Link>
          <nav aria-label="Main" className="flex flex-wrap items-center gap-4">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                  focusRing,
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-4">
            <Link
              href="/login"
              className={cn("rounded-md text-sm font-medium text-muted-foreground hover:text-foreground", focusRing)}
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className={cn(
                "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
                focusRing,
              )}
            >
              Start free
            </Link>
          </div>
        </div>
      </header>

      {children}

      <footer className="border-t">
        <div className="mx-auto grid w-full max-w-5xl gap-8 px-6 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <p className="font-display text-sm font-semibold">supertrainer</p>
            <p className="text-sm text-muted-foreground">
              An AI that coaches like you — not instead of you.
            </p>
          </div>
          <FooterColumn
            title="Product"
            links={[
              { href: "/pricing", label: "Pricing" },
              { href: "/switch", label: "Switching over" },
              { href: "/compare/trainerize", label: "vs ABC Trainerize" },
              { href: "/compare/everfit", label: "vs Everfit" },
            ]}
          />
          <FooterColumn
            title="Trust"
            links={[
              { href: "/security", label: "Security & AI policy" },
              { href: "/docs/data", label: "Your data" },
              { href: "/legal/terms", label: "Terms" },
              { href: "/legal/privacy", label: "Privacy" },
            ]}
          />
          <FooterColumn
            title="Get started"
            links={[
              { href: "/signup", label: "Create an account" },
              { href: "/login", label: "Log in" },
            ]}
          />
        </div>
      </footer>
    </div>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div className="space-y-2">
      <p className="metric-label">{title}</p>
      <ul className="space-y-1.5">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className={cn(
                "rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground",
                focusRing,
              )}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
