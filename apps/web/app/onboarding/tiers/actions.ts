"use server";

import { revalidatePath } from "next/cache";

import type { Json } from "@supertrainer/db/types";

import { completeStep } from "@/app/onboarding/actions";
import { getSessionClaims } from "@/lib/onboarding/state";
import { validateTiers, type TierError, type TierInput } from "@/lib/tiers/schema";
import { createClient } from "@/lib/supabase/server";

export interface SaveTiersResult {
  ok: boolean;
  message?: string;
  errors?: TierError[];
}

// Replaces the org's tier set with the provided list (position = array order).
// Existing tiers are updated in place (preserving stripe_product_id for P8),
// new ones inserted, and removed ones deleted. Marks the tiers step done.
export async function saveTiers(tiers: TierInput[]): Promise<SaveTiersResult> {
  const { orgId, role } = await getSessionClaims();
  if (!orgId) return { ok: false, message: "Your session expired — sign in again." };
  if (role !== "owner" && role !== "staff") {
    return { ok: false, message: "Only trainers can edit tiers." };
  }

  const errors = validateTiers(tiers);
  if (errors.length > 0) return { ok: false, errors };

  const supabase = await createClient();

  const { data: existing, error: readError } = await supabase
    .from("tiers")
    .select("id")
    .eq("org_id", orgId);
  if (readError) return { ok: false, message: readError.message };

  const keepIds = new Set(tiers.map((t) => t.id).filter(Boolean) as string[]);
  const toDelete = (existing ?? [])
    .map((r) => r.id)
    .filter((id) => !keepIds.has(id));

  if (toDelete.length > 0) {
    const { error } = await supabase.from("tiers").delete().in("id", toDelete);
    if (error) return { ok: false, message: error.message };
  }

  for (const [index, tier] of tiers.entries()) {
    const row = {
      org_id: orgId,
      name: tier.name.trim(),
      price_cents: tier.price_cents,
      currency: tier.currency,
      cadence: "monthly" as const,
      position: index,
      features: tier.features as unknown as Json,
      is_active: true,
    };
    const { error } = tier.id
      ? await supabase.from("tiers").update(row).eq("id", tier.id)
      : await supabase.from("tiers").insert(row);
    if (error) return { ok: false, message: error.message };
  }

  await completeStep("tiers");
  revalidatePath("/onboarding/tiers");
  revalidatePath("/onboarding");
  return { ok: true };
}
