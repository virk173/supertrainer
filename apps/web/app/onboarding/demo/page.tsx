import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@supertrainer/ui/components/button";

import { DemoClient } from "@/components/demo-client";
import { getSessionClaims } from "@/lib/onboarding/state";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Demo client — supertrainer" };

function appOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export default async function DemoStepPage() {
  const { orgId, role } = await getSessionClaims();
  if (!orgId) redirect("/login?error=Please%20sign%20in%20again");
  if (role === "client") redirect("/portal");

  const supabase = await createClient();
  const [{ data: demo }, { data: org }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, intake, health_flags")
      .eq("org_id", orgId)
      .eq("is_demo", true)
      .maybeSingle(),
    supabase.from("orgs").select("slug").eq("id", orgId).maybeSingle(),
  ]);

  const teaserUrl = org?.slug ? `${appOrigin()}/c/${org.slug}` : null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-6 py-10 sm:py-14">
      <Button asChild variant="ghost" size="sm" className="mb-6 -ml-3">
        <Link href="/onboarding">
          <ArrowLeft aria-hidden="true" className="size-4" /> Back to checklist
        </Link>
      </Button>

      <div className="mb-8 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Meet your demo client
        </h1>
        <p className="text-sm text-muted-foreground">
          Alex Demo comes pre-loaded so every screen has something to show while
          you get set up. Excluded from your analytics and billing, and
          resettable any time.
        </p>
      </div>

      <DemoClient
        demo={
          demo
            ? {
                intake: (demo.intake ?? {}) as Record<string, string>,
                healthFlags: (demo.health_flags ?? {}) as {
                  allergies?: string[];
                },
              }
            : null
        }
        teaserUrl={teaserUrl}
      />
    </main>
  );
}
