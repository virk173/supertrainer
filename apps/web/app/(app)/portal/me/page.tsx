import Link from "next/link";
import { notFound } from "next/navigation";
import { CreditCard } from "lucide-react";

import { Button } from "@supertrainer/ui/components/button";
import { cn, focusRing } from "@supertrainer/ui/lib/utils";

import { signOut } from "@/app/(auth)/actions";
import { BringAFriend } from "@/components/portal/bring-a-friend";
import { YourData } from "@/components/portal/your-data";
import { DELETION_GRACE_DAYS } from "@/lib/data/deletion";
import { clientCode } from "@/lib/growth/referrals";
import { getSessionClaims } from "@/lib/onboarding/state";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Me — supertrainer" };

export default async function PortalMePage() {
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

  const [{ data: profile }, { data: org }, { data: jobs }, { data: pending }] = await Promise.all([
    service.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
    service.from("orgs").select("name").eq("id", orgId).maybeSingle(),
    service
      .from("export_jobs")
      .select("id, status, size_bytes, requested_at")
      .eq("client_id", client.id)
      .order("requested_at", { ascending: false })
      .limit(3),
    service
      .from("deletion_requests")
      .select("id, grace_until")
      .eq("client_id", client.id)
      .eq("status", "pending")
      .maybeSingle(),
  ]);

  // Phase 9.4 — only if this client's coach turned it on.
  const friendCode = await clientCode(orgId, client.id);
  const origin = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

  return (
    <div className="space-y-6" data-testid="portal-me">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">
          {profile?.display_name ?? "Your account"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {org?.name ? `Coached by ${org.name}` : "Your account and your data."}
        </p>
      </div>

      <Link
        href="/portal/membership"
        className={cn(
          "flex items-center gap-3 rounded-md border bg-surface-raised p-4 transition-colors hover:bg-foreground/5",
          focusRing,
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4"
        >
          <CreditCard />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Membership</span>
          <span className="block text-sm text-muted-foreground">
            Your plan, payment method, and receipts.
          </span>
        </span>
      </Link>

      {friendCode ? (
        <BringAFriend link={`${origin}/r/${friendCode}`} coachName={org?.name ?? "your coach"} />
      ) : null}

      <YourData
        graceDays={DELETION_GRACE_DAYS}
        exports={(jobs ?? []).map((j) => ({
          id: j.id,
          status: j.status,
          sizeBytes: j.size_bytes,
          requestedAt: j.requested_at,
        }))}
        scheduledDeletion={pending ? { graceUntil: pending.grace_until } : null}
      />

      <form action={signOut}>
        <Button type="submit" variant="ghost" className="text-muted-foreground">
          Sign out
        </Button>
      </form>
    </div>
  );
}
