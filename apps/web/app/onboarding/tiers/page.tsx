import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@supertrainer/ui/components/button";

import { TierBuilder } from "@/components/tier-builder";
import { getSessionClaims } from "@/lib/onboarding/state";
import {
  templateLadder,
  type CheckinFrequency,
  type TierFeatures,
  type TierInput,
} from "@/lib/tiers/schema";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Build your tiers — supertrainer" };

function toFeatures(raw: unknown): TierFeatures {
  const f = (raw ?? {}) as Partial<TierFeatures>;
  return {
    checkin_frequency: (f.checkin_frequency ?? "none") as CheckinFrequency,
    video_calls_per_month: Number(f.video_calls_per_month ?? 0),
    response_priority: Boolean(f.response_priority),
    custom_lines: Array.isArray(f.custom_lines) ? f.custom_lines : [],
  };
}

export default async function TiersStepPage() {
  const { orgId, role } = await getSessionClaims();
  if (!orgId) redirect("/login?error=Please%20sign%20in%20again");
  if (role === "client") redirect("/portal");

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("tiers")
    .select("id, name, price_cents, currency, features")
    .eq("org_id", orgId)
    .order("position", { ascending: true });

  const initialTiers: TierInput[] =
    rows && rows.length > 0
      ? rows.map((r) => ({
          id: r.id,
          name: r.name,
          price_cents: r.price_cents,
          currency: r.currency,
          features: toFeatures(r.features),
        }))
      : templateLadder();

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:py-14">
      <Button asChild variant="ghost" size="sm" className="mb-6 -ml-3">
        <Link href="/onboarding">
          <ArrowLeft aria-hidden="true" className="size-4" /> Back to checklist
        </Link>
      </Button>

      <div className="mb-8 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Build your coaching tiers
        </h1>
        <p className="text-sm text-muted-foreground">
          Start from this ladder and make it yours — rename, reprice, and edit
          what each tier includes. AI coaching is on every tier; the tiers sell
          your human attention.
        </p>
      </div>

      <TierBuilder initialTiers={initialTiers} />
    </main>
  );
}
