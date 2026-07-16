import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@supertrainer/ui/components/button";
import type { BrandConfig } from "@supertrainer/ui/lib/brand";

import { BrandForm } from "@/components/brand-form";
import { getSessionClaims } from "@/lib/onboarding/state";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Brand setup — supertrainer" };

export default async function BrandStepPage() {
  const { orgId, role } = await getSessionClaims();
  if (!orgId) redirect("/login?error=Please%20sign%20in%20again");
  if (role === "client") redirect("/portal");

  const supabase = await createClient();
  const { data: org } = await supabase
    .from("orgs")
    .select("id, name, slug, brand")
    .eq("id", orgId)
    .maybeSingle();

  if (!org) redirect("/login?error=Please%20sign%20in%20again");

  const brand = (org.brand ?? {}) as BrandConfig;
  // A fresh org's slug is the auto-generated bootstrap slug (name-xxxxxx); show
  // it as the starting point but let the trainer claim a clean handle.
  const initialSlug = org.slug;

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-6 py-10 sm:py-14">
      <Button asChild variant="ghost" size="sm" className="mb-6 -ml-3">
        <Link href="/onboarding">
          <ArrowLeft aria-hidden="true" className="size-4" /> Back to checklist
        </Link>
      </Button>

      <div className="mb-8 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Set up your brand
        </h1>
        <p className="text-sm text-muted-foreground">
          This is what clients see on your teaser page, portal, and plan PDFs.
        </p>
      </div>

      <BrandForm
        orgId={org.id}
        orgName={org.name}
        initialSlug={initialSlug}
        initialBrand={brand}
      />
    </main>
  );
}
