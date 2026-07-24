"use client";

import * as React from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  CreditCard,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { Badge } from "@supertrainer/ui/components/badge";
import { Button } from "@supertrainer/ui/components/button";
import { EmptyState } from "@supertrainer/ui/components/empty-state";

import {
  refreshConnectStatus,
  startConnectOnboarding,
  syncTiers,
} from "@/app/(app)/trainer/settings/payments/actions";
import type { BillingOverview } from "@/lib/payments/connect";

const SEAT_LABEL: Record<string, string> = {
  "20": "Up to 20 clients",
  "50": "Up to 50 clients",
  "100": "Up to 100 clients",
  unlimited: "Unlimited clients",
};

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border bg-surface-raised p-5">
      <p className="metric-label mb-4">{title}</p>
      {children}
    </section>
  );
}

export function PaymentsSettings({
  overview,
  configured,
}: {
  overview: BillingOverview;
  configured: boolean;
}) {
  const [pending, setPending] = React.useState<null | "connect" | "refresh" | "sync">(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  if (!configured) {
    return (
      <EmptyState
        icon={<CreditCard />}
        title="Payments aren’t available yet"
        description="Client billing and payouts turn on once the platform finishes its payments setup. Your tiers and clients are ready — nothing to do here for now."
      />
    );
  }

  const connect = overview.connect;
  const enabled = connect?.chargesEnabled && connect?.payoutsEnabled;
  const started = Boolean(connect?.stripeAccountId);

  async function onConnect() {
    setPending("connect");
    setNotice(null);
    const res = await startConnectOnboarding();
    if (res.ok && res.url) {
      window.location.href = res.url;
      return; // navigating away
    }
    setPending(null);
    setNotice(res.message ?? "Couldn’t start onboarding.");
  }

  async function onRefresh() {
    setPending("refresh");
    setNotice(null);
    const res = await refreshConnectStatus();
    setPending(null);
    setNotice(res.ok ? "Account status updated." : res.message ?? "Couldn’t refresh.");
  }

  async function onSync() {
    setPending("sync");
    setNotice(null);
    const res = await syncTiers();
    setPending(null);
    if (res.ok) {
      setNotice(
        res.applied
          ? `Synced — ${res.applied} change${res.applied === 1 ? "" : "s"} pushed to Stripe.`
          : "Your tiers are already up to date in Stripe.",
      );
    } else {
      setNotice(res.message ?? "Couldn’t sync your tiers.");
    }
  }

  return (
    <div className="space-y-4" data-testid="payments-settings">
      {/* ── Connect / payouts ─────────────────────────────────────────────── */}
      <Panel title="Payouts">
        {!started ? (
          <div className="space-y-4">
            <p className="max-w-prose text-sm text-muted-foreground">
              Connect a Stripe account to take client payments and get paid out. Stripe
              handles identity, tax forms, and cross-border payouts — your clients only
              ever see your brand.
            </p>
            <Button onClick={onConnect} disabled={pending !== null} data-testid="connect-stripe">
              {pending === "connect" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <CreditCard />
              )}
              Connect Stripe
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={connect?.chargesEnabled ? "success" : "outline"}>
                {connect?.chargesEnabled ? (
                  <>
                    <CheckCircle2 /> Charges enabled
                  </>
                ) : (
                  "Charges pending"
                )}
              </Badge>
              <Badge variant={connect?.payoutsEnabled ? "success" : "outline"}>
                {connect?.payoutsEnabled ? (
                  <>
                    <CheckCircle2 /> Payouts enabled
                  </>
                ) : (
                  "Payouts pending"
                )}
              </Badge>
              {connect?.lockedCurrency ? (
                <Badge variant="muted">{connect.lockedCurrency.toUpperCase()}</Badge>
              ) : null}
            </div>

            {!enabled && connect?.requirementsDue.length ? (
              <div className="rounded-md border border-dashed p-4">
                <p className="text-sm font-medium">Stripe still needs a few details</p>
                <ul className="mt-2 list-inside list-disc text-sm text-muted-foreground">
                  {connect.requirementsDue.slice(0, 5).map((r) => (
                    <li key={r}>{r.replaceAll(".", " → ").replaceAll("_", " ")}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {!enabled ? (
                <Button onClick={onConnect} disabled={pending !== null}>
                  {pending === "connect" ? <Loader2 className="animate-spin" /> : <ArrowUpRight />}
                  Finish setup on Stripe
                </Button>
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                  You’re set up to take payments.
                </p>
              )}
              <Button variant="ghost" onClick={onRefresh} disabled={pending !== null}>
                {pending === "refresh" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                Refresh status
              </Button>
            </div>
          </div>
        )}
      </Panel>

      {/* ── Tier sync ─────────────────────────────────────────────────────── */}
      <Panel title="Tiers in Stripe">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {overview.activeTiers === 0
              ? "You haven’t built any tiers yet."
              : overview.unsyncedPaidTiers > 0
                ? `${overview.unsyncedPaidTiers} of ${overview.activeTiers} tier${
                    overview.activeTiers === 1 ? "" : "s"
                  } still need a Stripe price.`
                : `All ${overview.activeTiers} tier${
                    overview.activeTiers === 1 ? "" : "s"
                  } are synced to Stripe.`}
          </p>
          <Button
            variant="outline"
            onClick={onSync}
            disabled={pending !== null || !enabled || overview.activeTiers === 0}
            data-testid="sync-tiers"
          >
            {pending === "sync" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Sync tiers to Stripe
          </Button>
        </div>
        {!enabled && overview.activeTiers > 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Finish your Stripe setup above to start selling tiers.
          </p>
        ) : null}
      </Panel>

      {/* ── Platform plan ─────────────────────────────────────────────────── */}
      <Panel title="Your plan">
        {overview.platformSub ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="metric text-lg">{SEAT_LABEL[overview.platformSub.seatBand]}</p>
            <Badge
              variant={
                overview.platformSub.status === "active" ||
                overview.platformSub.status === "trialing"
                  ? "success"
                  : overview.platformSub.status === "past_due"
                    ? "warning"
                    : "muted"
              }
            >
              {overview.platformSub.status.replace("_", " ")}
            </Badge>
            {overview.platformSub.founderPricing ? (
              <Badge variant="muted">Founder pricing</Badge>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Your platform plan starts when you take on your first paying client. Seats
            scale with your roster — no add-ons, ever.
          </p>
        )}
      </Panel>

      <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
        {notice}
      </p>
    </div>
  );
}
