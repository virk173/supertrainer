"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CreditCard, Loader2, Receipt } from "lucide-react";

import { Badge } from "@supertrainer/ui/components/badge";
import { Button } from "@supertrainer/ui/components/button";
import { EmptyState } from "@supertrainer/ui/components/empty-state";

import {
  cancelMembership,
  confirmChange,
  openBillingPortal,
  pauseMembership,
  previewChange,
  resumeMembership,
  startTierCheckout,
} from "@/app/(app)/portal/membership/actions";
import type { MembershipView } from "@/lib/payments/checkout";

interface TierOption {
  id: string;
  name: string;
  priceLabel: string;
}

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(
      cents / 100,
    );
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

const STATUS_TONE: Record<string, "success" | "warning" | "muted"> = {
  active: "success",
  trialing: "success",
  past_due: "warning",
  paused: "warning",
  canceled: "muted",
  unpaid: "warning",
  incomplete: "muted",
};

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border bg-surface-raised p-5">
      <p className="metric-label mb-4">{title}</p>
      {children}
    </section>
  );
}

export function Membership({
  membership,
  tiers,
  configured,
}: {
  membership: MembershipView;
  tiers: TierOption[];
  configured: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [previewFor, setPreviewFor] = React.useState<{ tierId: string; sentence: string } | null>(
    null,
  );

  const sub = membership.subscription;
  const active = sub && (sub.status === "active" || sub.status === "trialing");
  const restricted = sub && (sub.pauseReason === "dunning" || sub.status === "past_due" || sub.status === "unpaid");
  const onVacation = sub && sub.pauseReason === "vacation";

  async function go(fn: () => Promise<{ ok: boolean; url?: string; message?: string }>, key: string) {
    setPending(key);
    setNotice(null);
    const res = await fn();
    if (res.ok && res.url) {
      window.location.href = res.url;
      return;
    }
    setPending(null);
    if (res.ok) {
      router.refresh();
    } else {
      setNotice(res.message ?? "Something went wrong.");
    }
  }

  async function preview(tierId: string) {
    setPending(`preview:${tierId}`);
    setNotice(null);
    const res = await previewChange(tierId);
    setPending(null);
    if (res.ok && res.preview) {
      setPreviewFor({ tierId, sentence: res.preview.sentence });
    } else {
      setNotice(res.message ?? "Couldn’t preview that change.");
    }
  }

  async function confirm(tierId: string) {
    setPending(`confirm:${tierId}`);
    const res = await confirmChange(tierId);
    setPending(null);
    setPreviewFor(null);
    setNotice(res.ok ? "Your plan is updated." : res.message ?? "Couldn’t change your plan.");
  }

  return (
    <div className="space-y-4" data-testid="membership">
      {/* ── restricted (dunning) banner — system voice, never the coach ────── */}
      {restricted ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning bg-warning/10 p-4"
          role="status"
          data-testid="membership-restricted"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-warning-text">Your plan is paused</p>
            <p className="text-sm text-muted-foreground">
              A payment didn’t go through. Update your card to pick up right where you left off — your history is safe.
            </p>
          </div>
          <Button onClick={() => go(openBillingPortal, "portal")} disabled={!!pending}>
            {pending === "portal" ? <Loader2 className="animate-spin" /> : <CreditCard />}
            Update payment to resume
          </Button>
        </div>
      ) : null}

      {/* ── current plan ──────────────────────────────────────────────────── */}
      <Panel title="Your membership">
        {sub && membership.tier ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <p className="metric text-lg">{membership.tier.name}</p>
              <Badge variant={STATUS_TONE[sub.status] ?? "muted"}>
                {sub.pauseReason === "dunning"
                  ? "payment needed"
                  : sub.pauseReason === "vacation"
                    ? "paused"
                    : sub.status.replace("_", " ")}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {money(membership.tier.priceCents, membership.tier.currency)} / month
              </span>
            </div>
            {sub.currentPeriodEnd ? (
              <p className="text-sm text-muted-foreground">
                {sub.cancelAtPeriodEnd ? "Ends" : "Renews"}{" "}
                {new Date(sub.currentPeriodEnd).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => go(openBillingPortal, "portal")} disabled={!!pending}>
                {pending === "portal" ? <Loader2 className="animate-spin" /> : <CreditCard />}
                Update payment method
              </Button>
              {onVacation ? (
                <Button variant="ghost" onClick={() => go(resumeMembership, "resume")} disabled={!!pending}>
                  {pending === "resume" ? <Loader2 className="animate-spin" /> : null}
                  Resume membership
                </Button>
              ) : active ? (
                <Button variant="ghost" onClick={() => go(pauseMembership, "pause")} disabled={!!pending}>
                  {pending === "pause" ? <Loader2 className="animate-spin" /> : null}
                  Pause membership
                </Button>
              ) : null}
              {active && !sub.cancelAtPeriodEnd ? (
                <Button variant="ghost" onClick={() => go(cancelMembership, "cancel")} disabled={!!pending}>
                  {pending === "cancel" ? <Loader2 className="animate-spin" /> : null}
                  Cancel membership
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<CreditCard />}
            title={configured ? "No active membership" : "Membership isn’t available yet"}
            description={
              configured
                ? "Choose a plan below to start training with your coach."
                : "Your coach is finishing payment setup. Your plan and coaching are unaffected."
            }
          />
        )}
      </Panel>

      {/* ── change / choose plan ──────────────────────────────────────────── */}
      {configured && tiers.length > 0 ? (
        <Panel title={active ? "Change plan" : "Choose a plan"}>
          <ul className="space-y-2">
            {tiers.map((t) => {
              const isCurrent = membership.tier?.id === t.id;
              return (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.priceLabel}</p>
                  </div>
                  {isCurrent ? (
                    <Badge variant="muted">
                      <CheckCircle2 /> Current
                    </Badge>
                  ) : active ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => preview(t.id)}
                      disabled={!!pending}
                    >
                      {pending === `preview:${t.id}` ? <Loader2 className="animate-spin" /> : null}
                      Switch
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => go(() => startTierCheckout(t.id), `checkout:${t.id}`)}
                      disabled={!!pending}
                    >
                      {pending === `checkout:${t.id}` ? <Loader2 className="animate-spin" /> : null}
                      Choose
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>

          {previewFor ? (
            <div className="mt-4 rounded-md border border-dashed p-4" role="dialog" aria-label="Confirm plan change">
              <p className="text-sm">{previewFor.sentence}</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => confirm(previewFor.tierId)} disabled={!!pending}>
                  {pending === `confirm:${previewFor.tierId}` ? (
                    <Loader2 className="animate-spin" />
                  ) : null}
                  Confirm change
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPreviewFor(null)} disabled={!!pending}>
                  Keep current plan
                </Button>
              </div>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {/* ── payment history ───────────────────────────────────────────────── */}
      {membership.history.length > 0 ? (
        <Panel title="Payment history">
          <ul className="divide-y">
            {membership.history.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Receipt className="size-4" aria-hidden="true" />
                  {new Date(h.date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
                <span className="flex items-center gap-2">
                  <span className="metric">{money(h.amountCents, h.currency)}</span>
                  <Badge variant={h.status === "paid" ? "success" : "warning"}>{h.status}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
        {notice}
      </p>
    </div>
  );
}
