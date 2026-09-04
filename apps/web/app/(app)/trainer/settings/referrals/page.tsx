import { notFound } from "next/navigation";

import { ReferralsPanel } from "@/components/settings/referrals-panel";
import { MONTHLY_CREDIT_CAP, REFERRER_CREDIT_MONTHS, REFERRED_TRIAL_EXTRA_DAYS } from "@/lib/growth/referral-core";
import { getSessionClaims } from "@/lib/onboarding/state";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Referrals — supertrainer" };

function appOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export default async function ReferralsPage() {
  const { orgId, role } = await getSessionClaims();
  if (!orgId || (role !== "owner" && role !== "staff")) notFound();

  const service = createServiceClient();
  const [{ data: org }, { data: code }, { data: referrals }, { data: sub }] = await Promise.all([
    service.from("orgs").select("client_referrals_enabled").eq("id", orgId).maybeSingle(),
    service
      .from("referral_codes")
      .select("code")
      .eq("org_id", orgId)
      .eq("kind", "trainer")
      .maybeSingle(),
    service
      .from("referrals")
      .select("id, kind, status, reason, referrer_credit_months, created_at, credited_at")
      .eq("referrer_org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(25),
    service
      .from("platform_subscriptions")
      .select("credit_months_remaining")
      .eq("org_id", orgId)
      .maybeSingle(),
  ]);

  return (
    <ReferralsPanel
      origin={appOrigin()}
      code={code?.code ?? null}
      clientReferralsEnabled={Boolean(org?.client_referrals_enabled)}
      bankedMonths={sub?.credit_months_remaining ?? 0}
      creditMonths={REFERRER_CREDIT_MONTHS}
      trialDays={REFERRED_TRIAL_EXTRA_DAYS}
      monthlyCap={MONTHLY_CREDIT_CAP}
      referrals={(referrals ?? []).map((r) => ({
        id: r.id,
        kind: r.kind,
        status: r.status,
        reason: r.reason,
        months: r.referrer_credit_months,
        createdAt: r.created_at,
      }))}
    />
  );
}
