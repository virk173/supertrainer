import { NextResponse } from "next/server";

import { macrosForGrams } from "@supertrainer/nutrition-engine";

import { getCurrentClientContext } from "@/lib/ledger/log";
import type { PlanContent } from "@/lib/plans/edit";
import { buildGroceryList, type GroceryFoodMeta } from "@/lib/plans/grocery";
import { renderPlanPdf, type PdfDayType } from "@/lib/plans/pdf";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Phase 4.5 — the client's branded plan PDF (react-pdf, server-rendered on
// demand). Generated on approve + emailed is the P6 delivery; this is the
// in-app download.
export async function GET() {
  const ctx = await getCurrentClientContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const service = createServiceClient();

  const [{ data: plan }, { data: org }, { data: active }] = await Promise.all([
    service.from("plans").select("content").eq("client_id", ctx.clientId).eq("status", "approved").order("approved_at", { ascending: false }).limit(1).maybeSingle(),
    service.from("orgs").select("name").eq("id", ctx.orgId).maybeSingle(),
    service.from("plans_active").select("day_types, schedule").eq("client_id", ctx.clientId).maybeSingle(),
  ]);
  if (!plan) return NextResponse.json({ error: "no active plan" }, { status: 404 });

  const content = plan.content as PlanContent & { approvedVersion?: string };
  const version = content.versions.find((v) => v.label === content.approvedVersion) ?? content.versions[0];
  const dayTypeTargets = new Map((active?.day_types as { name: string; kcal: number; protein_g: number }[] | null ?? []).map((d) => [d.name, d]));

  const ids = [...new Set(version.dayTypes.flatMap((d) => d.meals.flatMap((m) => m.items.map((i) => i.food_id))))];
  const { data: foods } = ids.length
    ? await service.from("foods").select("id, name, allergen_tags, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g").in("id", ids)
    : { data: [] };
  const foodById = new Map((foods ?? []).map((f) => [f.id, f]));
  const foodMeta = new Map<string, GroceryFoodMeta>((foods ?? []).map((f) => [f.id, { name: f.name, allergen_tags: f.allergen_tags }]));

  const dayTypes: PdfDayType[] = version.dayTypes.map((dt) => {
    const t = dayTypeTargets.get(dt.name);
    return {
      name: dt.name,
      kcal: t?.kcal ?? 0,
      protein_g: t?.protein_g ?? 0,
      meals: dt.meals.map((m) => ({
        slot: m.slot,
        prepNote: m.prepNote,
        items: m.items.map((it) => {
          const f = foodById.get(it.food_id);
          return { name: f?.name ?? it.food_id, grams: it.grams, kcal: f ? macrosForGrams(f, it.grams).kcal : 0 };
        }),
      })),
    };
  });

  const grocery = buildGroceryList({
    dayTypes: version.dayTypes,
    schedule: (active?.schedule as Record<string, string>) ?? {},
    foodMeta,
  });

  const buffer = await renderPlanPdf({
    orgName: org?.name ?? "Your coach",
    accent: "#111111",
    clientName: "you",
    dayTypes,
    grocery,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="diet-plan.pdf"`,
    },
  });
}
