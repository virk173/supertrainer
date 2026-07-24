import { notFound } from "next/navigation";

import { isStripeConfigured } from "@supertrainer/payments";

import { Membership } from "@/components/portal/membership";
import { getSessionClaims } from "@/lib/onboarding/state";
import { getMembership } from "@/lib/payments/checkout";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Membership — supertrainer" };

function priceLabel(cents: number, currency: string): string {
  const amount = (() => {
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency.toUpperCase(),
      }).format(cents / 100);
    } catch {
      return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
    }
  })();
  return `${amount} / month`;
}

export default async function MembershipPage() {
  const { orgId, userId } = await getSessionClaims();
  if (!orgId || !userId) notFound();

  const service = createServiceClient();
  const { data: client } = await service
    .from("clients")
    .select("id")
    .eq("profile_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!client) notFound();

  // The membership state lives in our DB (populated by the 8.3 webhook), so we
  // ALWAYS read it — a client sees their plan + any restricted/paused state even
  // if this server lacks the platform Stripe secret. `configured` only gates the
  // live-Stripe ACTIONS (checkout, card update, tier change).
  const configured = isStripeConfigured();
  const membership = await getMembership(client.id);

  // Client-facing tier display reads through the service role (tiers are staff-
  // RLS), scoped to this client's org in code.
  const { data: tierRows } = await service
    .from("tiers")
    .select("id, name, price_cents, currency, position")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("position", { ascending: true });

  const tiers = (tierRows ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    priceLabel: priceLabel(t.price_cents, t.currency),
  }));

  return (
    <div className="space-y-6" data-testid="membership-page">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight" data-testid="membership-title">
          Membership
        </h1>
        <p className="text-sm text-muted-foreground">
          Your plan, payments, and billing details.
        </p>
      </div>
      <Membership membership={membership} tiers={tiers} configured={configured} />
    </div>
  );
}
