import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";

import { cn, focusRing } from "@supertrainer/ui/lib/utils";

import { isStripeConfigured } from "@supertrainer/payments";

import { PaymentsSettings } from "@/components/settings/payments-settings";
import { getSessionClaims } from "@/lib/onboarding/state";
import {
  getBillingOverview,
  refreshAccountStatus,
  type BillingOverview,
} from "@/lib/payments/connect";

export const metadata = { title: "Payments — supertrainer" };

const EMPTY_OVERVIEW: BillingOverview = {
  connect: null,
  platformSub: null,
  unsyncedPaidTiers: 0,
  activeTiers: 0,
};

export default async function TrainerPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ connect?: string }>;
}) {
  const { orgId, role } = await getSessionClaims();
  if (!orgId || (role !== "owner" && role !== "staff")) notFound();

  const configured = isStripeConfigured();
  const { connect } = await searchParams;

  // Returning from Stripe-hosted onboarding — pull the latest account state so
  // the panel reflects what the trainer just completed. Best-effort; the manual
  // "Refresh status" button is the fallback.
  if (configured && connect === "return") {
    try {
      await refreshAccountStatus(orgId);
    } catch {
      // surfaced via the panel's Refresh button
    }
  }

  const overview = configured ? await getBillingOverview(orgId) : EMPTY_OVERVIEW;

  return (
    <div className="space-y-6" data-testid="payments">
      <div className="space-y-1">
        <Link
          href="/trainer/settings"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Settings
        </Link>
        <h1 className="text-xl font-semibold tracking-tight" data-testid="payments-title">
          Payments
        </h1>
        <p className="text-sm text-muted-foreground">
          Connect Stripe, sync your tiers, and get paid. Your clients only ever see your brand.
        </p>
      </div>

      <PaymentsSettings overview={overview} configured={configured} />

      <Link
        href="/trainer/settings/payments/cutover"
        className={cn(
          "group flex items-center gap-3 rounded-md border bg-surface-raised p-4 transition-colors hover:bg-foreground/5",
          focusRing,
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4"
        >
          <Users />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-sm font-medium">Move clients to billing</span>
          <span className="mt-0.5 block text-sm text-muted-foreground">
            Migrate clients you’ve been running manually onto real subscriptions.
          </span>
        </span>
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </div>
  );
}
