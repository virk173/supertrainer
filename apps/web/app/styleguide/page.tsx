import { Dumbbell, TrendingUp, Users } from "lucide-react";

import { Avatar } from "@supertrainer/ui/components/avatar";
import { Button } from "@supertrainer/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@supertrainer/ui/components/card";
import { EmptyState } from "@supertrainer/ui/components/empty-state";
import { ErrorFallback } from "@supertrainer/ui/components/error-boundary";
import { Input } from "@supertrainer/ui/components/input";
import { Label } from "@supertrainer/ui/components/label";
import {
  Skeleton,
  SkeletonCard,
  SkeletonText,
} from "@supertrainer/ui/components/skeleton";

import { PortalShell } from "@/components/portal-shell";
import { TrainerShell } from "@/components/trainer-shell";

import { ErrorDemo } from "./error-demo";
import { ThemeToggle } from "./theme-toggle";

export const metadata = { title: "Styleguide — supertrainer" };

/* Color pairings: chip shows the foreground on its background — the exact
 * combination later phases will render, so contrast QA is honest. */
const COLOR_PAIRS = [
  { name: "background", chip: "bg-background text-foreground border" },
  { name: "surface", chip: "bg-surface text-surface-foreground border" },
  {
    name: "surface-raised",
    chip: "bg-surface-raised text-surface-raised-foreground border shadow-sm",
  },
  { name: "primary", chip: "bg-primary text-primary-foreground" },
  { name: "muted", chip: "bg-muted text-muted-foreground" },
  { name: "success", chip: "bg-success text-success-foreground" },
  { name: "warning", chip: "bg-warning text-warning-foreground" },
  { name: "danger", chip: "bg-danger text-danger-foreground" },
  // Warning as TEXT on a light surface (not the warning fill) — this is the
  // combination SF-1 found rendering allergen text near-illegible (~2:1) when
  // components used --warning itself as ink. --warning-text is the dedicated
  // dark-amber ink for this case; keep both pairings QA'd so a future misuse
  // of --warning as text on --background/--surface fails this axe scan.
  { name: "warning-text/background", chip: "bg-background text-warning-text border" },
  { name: "warning-text/surface", chip: "bg-surface text-warning-text border" },
] as const;

const METRICS = [
  { label: "Adherence 7d", value: "86%", delta: "+4% vs last week" },
  { label: "Protein today", value: "142 g", delta: "target 160 g" },
  { label: "Kcal today", value: "2,180", delta: "target 2,300" },
  { label: "Check-in streak", value: "12 days", delta: "best 21" },
] as const;

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="space-y-6">
      <div>
        <p className="metric-label">{eyebrow}</p>
        <h2 id={`${id}-title`} className="text-xl font-semibold tracking-tight">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

export default function StyleguidePage() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-6">
          <h1 className="text-sm font-semibold tracking-tight">
            supertrainer styleguide
          </h1>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl space-y-16 px-6 py-10">
        <Section id="tokens" eyebrow="Tokens" title="Color">
          <p className="max-w-2xl text-sm text-muted-foreground">
            Chrome is achromatic. Color is reserved for state — success means
            an adherence hit, warning means drift, danger means missed or
            destructive. A colored mark always says something about a client.
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {COLOR_PAIRS.map(({ name, chip }) => (
              <div key={name} className="space-y-1.5">
                <div
                  className={`flex h-16 items-end rounded-lg p-3 text-xl font-bold ${chip}`}
                >
                  Aa
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                  {name}
                </p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="type" eyebrow="Tokens" title="Type & metrics">
          <div className="space-y-2">
            <p className="text-3xl font-semibold tracking-tight">
              Geist Sans carries everything.
            </p>
            <p className="text-base">
              Body text is 16px regular. Headings tighten their tracking.
            </p>
            <p className="text-sm text-muted-foreground">
              Secondary text steps down to 14px muted ink.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {METRICS.map(({ label, value, delta }) => (
              <Card key={label}>
                <CardContent className="space-y-1 p-4">
                  <p className="metric-label">{label}</p>
                  <p className="metric text-3xl">{value}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <TrendingUp aria-hidden="true" className="size-3" />
                    {delta}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Every numeric display wears the <code>metric</code> utility —
            semibold tabular numerals, so digit columns align. The values are
            always computed in code, never by a model.
          </p>
        </Section>

        <Section id="shape" eyebrow="Tokens" title="Radii & spacing">
          <div className="flex flex-wrap items-end gap-8">
            <div className="space-y-1.5">
              <div className="flex h-9 w-40 items-center rounded-md border bg-surface-raised px-3 text-sm text-muted-foreground">
                6px — inputs
              </div>
              <div className="flex h-20 w-40 items-center rounded-lg border bg-surface-raised px-3 text-sm text-muted-foreground">
                10px — cards
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-end gap-1">
                {[1, 2, 3, 4, 6, 8, 10, 12].map((step) => (
                  <div
                    key={step}
                    className="w-4 rounded-sm bg-primary/20"
                    style={{ height: `${step * 4}px` }}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                4px grid — every gap, inset, and size is a multiple of 4.
              </p>
            </div>
          </div>
        </Section>

        <Section id="components" eyebrow="Components" title="Primitives">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Save changes</Button>
            <Button variant="secondary">Duplicate plan</Button>
            <Button variant="outline">Preview</Button>
            <Button variant="ghost">Dismiss</Button>
            <Button variant="destructive">Remove client</Button>
            <Button disabled>Saving…</Button>
            <Button size="sm" variant="outline">
              Small
            </Button>
            <Button size="lg">Large</Button>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Invite a client</CardTitle>
                <CardDescription>
                  They get a link to join your org’s portal.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sg-email">Email</Label>
                  <Input
                    id="sg-email"
                    type="email"
                    placeholder="client@example.com"
                  />
                </div>
                <Button className="w-full">Send invite</Button>
              </CardContent>
            </Card>
            <div className="flex items-center gap-4 rounded-lg border bg-surface p-6">
              <Avatar name="Jordan Lee" />
              <Avatar name="Sam" className="size-10 text-sm" />
              <p className="text-sm text-muted-foreground">
                Initials avatars until profiles get photos.
              </p>
            </div>
          </div>
        </Section>

        <Section id="states" eyebrow="Components" title="The three states">
          <p className="max-w-2xl text-sm text-muted-foreground">
            Every screen in later phases renders one of these before its data
            exists: an empty state, a loading skeleton, or an error boundary.
          </p>
          <div className="grid gap-6 lg:grid-cols-2">
            <EmptyState
              icon={<Users />}
              title="No clients yet"
              description="Invite your first client to see their adherence, plans, and messages here."
              action={<Button size="sm">Invite a client</Button>}
            />
            <div className="space-y-4 rounded-lg border border-dashed p-6">
              <Skeleton className="h-8 w-1/3" />
              <SkeletonText />
              <SkeletonCard />
            </div>
            <ErrorFallback className="lg:col-span-1" />
            <ErrorDemo />
          </div>
        </Section>

        <Section id="shells" eyebrow="Shells" title="Trainer shell">
          <p className="max-w-2xl text-sm text-muted-foreground">
            Collapsible sidebar (icon rail below md), topbar with org switcher
            placeholder and avatar. Content scrolls; chrome stays put.
          </p>
          <div className="h-[560px] overflow-hidden rounded-lg border shadow-sm">
            <TrainerShell embedded className="h-full">
              <div className="space-y-6">
                <p className="text-2xl font-semibold tracking-tight">Home</p>
                <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                  {METRICS.map(({ label, value }) => (
                    <Card key={label}>
                      <CardContent className="space-y-1 p-4">
                        <p className="metric-label">{label}</p>
                        <p className="metric text-2xl">{value}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <EmptyState
                  icon={<Dumbbell />}
                  title="No sessions today"
                  description="Programmed rest day across your roster."
                />
              </div>
            </TrainerShell>
          </div>
        </Section>

        <Section id="portal" eyebrow="Shells" title="Portal shell">
          <p className="max-w-2xl text-sm text-muted-foreground">
            Mobile-first bottom tabs; on wider screens the column stays
            phone-shaped and centered. Framed at 375px below.
          </p>
          <div className="mx-auto h-[640px] w-full max-w-[375px] overflow-hidden rounded-lg border shadow-sm">
            <PortalShell embedded className="h-full">
              <div className="space-y-4">
                <p className="text-xl font-semibold tracking-tight">Today</p>
                <Card>
                  <CardContent className="space-y-1 p-4">
                    <p className="metric-label">Adherence 7d</p>
                    <p className="metric text-3xl">86%</p>
                  </CardContent>
                </Card>
                <EmptyState
                  title="Nothing to log yet"
                  description="Your plan and daily check-ins will appear here."
                />
              </div>
            </PortalShell>
          </div>
        </Section>
      </div>
    </main>
  );
}
