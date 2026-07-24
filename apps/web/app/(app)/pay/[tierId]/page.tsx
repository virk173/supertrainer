import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { isStripeConfigured } from "@supertrainer/payments";
import { EmptyState } from "@supertrainer/ui/components/empty-state";

import { SubscribeButton } from "@/components/portal/subscribe-button";
import { getSessionClaims } from "@/lib/onboarding/state";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Start your membership — supertrainer" };

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

// Phase 8.2 — the conversion moment. Teaser-unlock + invite-accept converge here.
// The client picks/confirms a tier, then hosted Stripe Checkout takes the card;
// the subscription row is created by the webhook (8.3), not this redirect.
export default async function PayPage({
  params,
}: {
  params: Promise<{ tierId: string }>;
}) {
  const { tierId } = await params;
  const { orgId, userId } = await getSessionClaims();
  if (!orgId || !userId) notFound();

  const service = createServiceClient();
  const { data: tier } = await service
    .from("tiers")
    .select("id, org_id, name, price_cents, currency, features, is_active")
    .eq("id", tierId)
    .maybeSingle();
  if (!tier || tier.org_id !== orgId || !tier.is_active) notFound();

  const configured = isStripeConfigured();
  const features = (tier.features ?? {}) as { custom_lines?: string[] };
  const lines = Array.isArray(features.custom_lines) ? features.custom_lines : [];

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="space-y-1 text-center">
        <p className="metric-label">Your plan</p>
        <h1 className="text-2xl font-semibold tracking-tight">{tier.name}</h1>
        <p className="metric text-3xl">
          {money(tier.price_cents, tier.currency)}
          <span className="ml-1 text-base font-medium text-muted-foreground">/ month</span>
        </p>
      </div>

      {lines.length > 0 ? (
        <ul className="space-y-2 rounded-md border bg-surface-raised p-5 text-sm">
          {lines.slice(0, 6).map((line, i) => (
            <li key={i} className="flex gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {configured ? (
        <div className="flex flex-col items-center gap-3">
          <SubscribeButton tierId={tier.id} label="Continue to secure checkout" />
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Payments secured by Stripe. Cancel anytime.
          </p>
        </div>
      ) : (
        <EmptyState
          icon={<ShieldCheck />}
          title="Checkout isn’t available yet"
          description="Your coach is finishing their payment setup. You’ll be able to start your membership here shortly."
        />
      )}
    </div>
  );
}
