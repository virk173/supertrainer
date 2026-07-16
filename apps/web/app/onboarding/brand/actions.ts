"use server";

import { revalidatePath } from "next/cache";

import type { BrandConfig, BrandSocials } from "@supertrainer/ui/lib/brand";
import { parseHex } from "@supertrainer/ui/lib/contrast";
import type { Json } from "@supertrainer/db/types";

import { completeStep } from "@/app/onboarding/actions";
import { getSessionClaims } from "@/lib/onboarding/state";
import { SLUG_ERROR_MESSAGE, validateSlug } from "@/lib/brand/slug";
import { createClient } from "@/lib/supabase/server";

import type { BrandFormState } from "./form-state";

function cleanSocial(value: FormDataEntryValue | null): string | undefined {
  const s = String(value ?? "").trim();
  if (!s) return undefined;
  // Never persist a javascript:/data: scheme — these render as links later.
  if (/^\s*(javascript|data|vbscript):/i.test(s)) return undefined;
  return s.slice(0, 200);
}

export async function saveBrand(
  _prev: BrandFormState,
  formData: FormData,
): Promise<BrandFormState> {
  const claims = await getSessionClaims();
  if (!claims.orgId) {
    return { ok: false, errors: {}, message: "Your session expired — sign in again." };
  }
  if (claims.role !== "owner" && claims.role !== "staff") {
    return { ok: false, errors: {}, message: "Only trainers can edit branding." };
  }

  const displayName = String(formData.get("displayName") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const primaryColorRaw = String(formData.get("primaryColor") ?? "").trim();
  const logoUrl = String(formData.get("logoUrl") ?? "").trim() || null;

  const errors: BrandFormState["errors"] = {};

  if (!displayName) errors.displayName = "Add a display name.";
  else if (displayName.length > 80) errors.displayName = "Keep it under 80 characters.";

  const slugError = validateSlug(slug);
  if (slugError) errors.slug = SLUG_ERROR_MESSAGE[slugError];

  let primaryColor: string | undefined;
  if (primaryColorRaw) {
    if (!parseHex(primaryColorRaw)) {
      errors.primaryColor = "Enter a valid hex color (e.g. #4F46E5).";
    } else {
      primaryColor = primaryColorRaw.toLowerCase();
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const socials: BrandSocials = {
    instagram: cleanSocial(formData.get("instagram")),
    youtube: cleanSocial(formData.get("youtube")),
    tiktok: cleanSocial(formData.get("tiktok")),
    website: cleanSocial(formData.get("website")),
  };

  const brand: BrandConfig = { displayName, logoUrl, primaryColor, socials };

  const supabase = await createClient();
  const { error } = await supabase
    .from("orgs")
    .update({ slug, brand: brand as unknown as Json })
    .eq("id", claims.orgId);

  if (error) {
    // Unique violation on the slug: another org already claimed it. The DB
    // constraint is the race-safe source of truth.
    if (error.code === "23505") {
      return { ok: false, errors: { slug: "That handle is already taken." } };
    }
    return { ok: false, errors: {}, message: error.message };
  }

  await completeStep("brand");
  revalidatePath("/onboarding/brand");
  revalidatePath("/onboarding");
  return { ok: true, errors: {}, message: "Brand saved." };
}
