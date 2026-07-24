import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { CutoverPanel } from "@/components/settings/cutover-panel";
import { getSessionClaims } from "@/lib/onboarding/state";
import { getCutoverList } from "@/lib/payments/cutover";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Cutover — supertrainer" };

export default async function CutoverPage() {
  const { orgId, role } = await getSessionClaims();
  if (!orgId || (role !== "owner" && role !== "staff")) notFound();

  const service = createServiceClient();
  const [{ clients, progress }, tiersRes, platformRes] = await Promise.all([
    getCutoverList(orgId),
    service.from("tiers").select("id, name").eq("org_id", orgId).eq("is_active", true).order("position"),
    service.from("platform_subscriptions").select("org_id").eq("org_id", orgId).maybeSingle(),
  ]);

  const tiers = (tiersRes.data ?? []).map((t) => ({ id: t.id, name: t.name }));

  return (
    <div className="space-y-6" data-testid="cutover">
      <div className="space-y-1">
        <Link
          href="/trainer/settings/payments"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Payments
        </Link>
        <h1 className="text-xl font-semibold tracking-tight" data-testid="cutover-title">
          Move clients to billing
        </h1>
        <p className="text-sm text-muted-foreground">
          Confirm a plan for each client you’ve been running manually. They keep full access during a 21-day
          window while they set up payment — nobody is cut off mid-month.
        </p>
      </div>

      <CutoverPanel
        clients={clients}
        progress={progress}
        tiers={tiers}
        platformEnrolled={Boolean(platformRes.data)}
      />
    </div>
  );
}
