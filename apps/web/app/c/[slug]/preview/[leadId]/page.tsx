import { isAiDegraded } from "@supertrainer/ai";
import { notFound } from "next/navigation";

import { TierCard } from "@supertrainer/ui/components/tier-card";

import { getOrgThemeBySlug } from "@/lib/brand/theme";
import { getOrCreatePreview } from "@/lib/preview/generate";
import { createServiceClient } from "@/lib/supabase/server";
import {
  AI_FLOOR,
  formatPrice,
  tierHighlightLines,
  type TierFeatures,
} from "@/lib/tiers/schema";

export const metadata = { title: "Your preview" };

// A couple of realistic, blurred placeholder rows — the "your full plan already
// exists" effect (blur, not truncation) per ORIGINAL-SPEC §10.
const BLURRED_MEAL_ROWS = [
  "Dinner — grilled protein, seasonal vegetables, and a measured carb",
  "Evening snack — a portioned high-protein option in your style",
];
const BLURRED_TRAINING_ROWS = [
  "Day 2 — lower body: 5 movements, progressive sets",
  "Day 3 — full body conditioning + accessory work",
];

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ slug: string; leadId: string }>;
}) {
  const { slug, leadId } = await params;
  const theme = await getOrgThemeBySlug(slug);
  if (!theme) notFound();

  const service = createServiceClient();
  const { data: lead } = await service
    .from("leads")
    .select("id, org_id")
    .eq("id", leadId)
    .maybeSingle();
  // Tenancy: the lead must belong to this branded org.
  if (!lead || lead.org_id !== theme.orgId) notFound();

  const preview = await getOrCreatePreview(leadId);
  // PO-4: when the preview couldn't be generated AND the AI resilience layer has
  // tripped its breaker (a broad Anthropic outage / exhausted credits), show
  // honest holding copy instead of implying the coach is finishing it by hand.
  const aiDegraded = !preview && isAiDegraded();

  const { data: tiers } = await service
    .from("tiers")
    .select("id, name, price_cents, currency, cadence, features")
    .eq("org_id", theme.orgId)
    .eq("is_active", true)
    .order("position");

  const featuredIdx = (tiers ?? []).reduce(
    (best, t, i, arr) => (t.price_cents > (arr[best]?.price_cents ?? -1) ? i : best),
    0,
  );

  return (
    <main style={theme.vars} className="min-h-[100dvh] bg-background pb-16">
      <header className="mx-auto flex max-w-lg items-center gap-3 px-6 pt-8">
        <span
          className="flex size-9 items-center justify-center rounded-lg text-sm font-semibold"
          style={{
            background: "var(--brand-primary, var(--color-primary))",
            color: "var(--brand-on-primary, var(--color-primary-foreground))",
          }}
        >
          {theme.name.slice(0, 1).toUpperCase()}
        </span>
        <p className="text-sm font-semibold">{theme.name}</p>
      </header>

      <div className="mx-auto max-w-lg space-y-6 px-6 pt-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Your plan is ready
          </h1>
          <p className="mt-1 text-sm text-muted-foreground" data-testid="preview-disclaimer">
            Draft preview — your coach will review and finalize.
          </p>
        </div>

        {preview ? (
          <section
            className="rounded-xl border bg-card p-5 shadow-sm"
            data-testid="preview-card"
          >
            {preview.coachNote && (
              <p className="mb-4 text-sm italic text-muted-foreground" data-testid="preview-note">
                “{preview.coachNote}”
              </p>
            )}

            <h2 className="metric-label mb-2 text-muted-foreground">Day 1 · Nutrition</h2>
            <div className="space-y-3">
              {[preview.diet.breakfast, preview.diet.lunch].map((meal, i) => (
                <div key={i} data-testid={i === 0 ? "preview-meal-breakfast" : "preview-meal-lunch"}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-medium">{meal.title}</span>
                    <span className="metric text-sm">{meal.macros.kcal} kcal</span>
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {meal.items.map((item) => (
                      <li
                        key={item.foodId}
                        className="flex justify-between text-sm text-muted-foreground"
                        data-testid="preview-food"
                      >
                        <span>{item.name}</span>
                        <span className="metric">{item.grams} g</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <h2 className="metric-label mb-2 mt-5 text-muted-foreground">
              Day 1 · {preview.training.focus}
            </h2>
            <ul className="space-y-1">
              {preview.training.exercises.map((ex, i) => (
                <li key={i} className="flex justify-between text-sm" data-testid="preview-exercise">
                  <span>{ex.name}</span>
                  <span className="metric text-muted-foreground">
                    {ex.sets} × {ex.reps}
                  </span>
                </li>
              ))}
            </ul>

            {/* Blurred remainder — the plan clearly continues behind the CTA. */}
            <div className="relative mt-5" data-testid="preview-blur">
              <div aria-hidden className="select-none space-y-2 blur-[6px]">
                {[...BLURRED_MEAL_ROWS, ...BLURRED_TRAINING_ROWS].map((row, i) => (
                  <div key={i} className="flex justify-between rounded-md bg-muted/60 px-3 py-2 text-sm">
                    <span>{row}</span>
                    <span className="metric text-muted-foreground">•••</span>
                  </div>
                ))}
              </div>
              <div className="pointer-events-none absolute inset-0 flex items-end justify-center bg-gradient-to-t from-card to-transparent">
                <span className="mb-1 text-xs font-medium text-muted-foreground">
                  Your full week is ready — choose a plan to unlock it
                </span>
              </div>
            </div>
          </section>
        ) : (
          <section
            className="rounded-xl border bg-card p-5 text-sm text-muted-foreground shadow-sm"
            data-testid="preview-pending"
            data-ai-degraded={aiDegraded ? "true" : "false"}
          >
            {aiDegraded
              ? "Our AI is briefly busy building previews right now — refresh in a moment and it'll appear. You can still choose a plan below to save your spot."
              : "Your coach is finalizing your personalized preview. Choose a plan below to save your spot."}
          </section>
        )}

        {/* Tier unlock */}
        {(tiers ?? []).length > 0 && (
          <section className="space-y-3" data-testid="preview-tiers">
            <h2 className="text-lg font-semibold tracking-tight">Choose your plan</h2>
            <p className="text-sm text-muted-foreground">
              Pick a plan to unlock your full plan. No payment yet — {theme.name} will
              confirm your spot.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {(tiers ?? []).map((tier, i) => (
                <TierCard
                  key={tier.id}
                  name={tier.name}
                  price={formatPrice(tier.price_cents, tier.currency)}
                  cadence={tier.cadence === "monthly" ? "/mo" : ""}
                  highlightLines={tierHighlightLines((tier.features ?? {}) as unknown as TierFeatures)}
                  aiFloor={AI_FLOOR}
                  featured={i === featuredIdx}
                  cta={
                    <a
                      href={`/c/${slug}/preview/${leadId}/convert?tier=${tier.id}`}
                      data-testid={`unlock-${tier.id}`}
                      className="mt-3 block rounded-md px-4 py-2 text-center text-sm font-medium"
                      style={{
                        background: "var(--brand-primary, var(--color-primary))",
                        color: "var(--brand-on-primary, var(--color-primary-foreground))",
                      }}
                    >
                      Choose {tier.name}
                    </a>
                  }
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
