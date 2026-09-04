// Phase 9.5 — the comparison data.
//
// RULES for this file, because a comparison page that is wrong is worse than no
// comparison page at all:
//   1. Every figure comes from the VENDOR'S OWN pricing page, not a review site.
//   2. Every row carries the URL it came from and the date it was checked.
//   3. The page renders that date. Prices change; a dated claim ages honestly,
//      an undated one becomes a lie.
//   4. If a figure cannot be verified on the vendor's page, it is omitted —
//      never estimated.

export interface CompetitorPlan {
  label: string;
  monthly: string;
  clients: string;
}

export interface CompetitorAddOn {
  name: string;
  monthly: string;
}

export interface Competitor {
  slug: string;
  name: string;
  /** the vendor's own pricing page */
  source: string;
  /** ISO date the figures above were read from that page */
  checkedOn: string;
  positioning: string;
  plans: CompetitorPlan[];
  addOns: CompetitorAddOn[];
  /** a worked example, computed from the rows above — never a vibe */
  example: { clients: number; base: string; addOns: string[]; note: string };
}

export const COMPETITORS: readonly Competitor[] = [
  {
    slug: "trainerize",
    name: "ABC Trainerize",
    source: "https://www.trainerize.com/pricing/",
    checkedOn: "2026-09-04",
    positioning:
      "The category incumbent. Broad, mature, and priced as a base plan with a long menu of add-ons.",
    plans: [
      { label: "Basic", monthly: "Free", clients: "1 client" },
      { label: "Grow", monthly: "$9", clients: "2 clients" },
      { label: "Pro", monthly: "from $23", clients: "5–200 clients, tiered" },
      { label: "Studio Plus", monthly: "$248", clients: "500–1000+ clients" },
    ],
    addOns: [
      { name: "Advanced nutrition coaching", monthly: "$20–$45" },
      { name: "Business", monthly: "$25" },
      { name: "Video coaching", monthly: "$10" },
      { name: "Stripe integrated payments", monthly: "$10" },
      { name: "Custom branded app", monthly: "$169 one-time" },
    ],
    example: {
      clients: 50,
      base: "Pro (tiered by client count)",
      addOns: ["Advanced nutrition coaching", "Stripe integrated payments", "Video coaching"],
      note: "Nutrition alone is $45/mo at the Pro 30–200 tiers.",
    },
  },
  {
    slug: "everfit",
    name: "Everfit",
    source: "https://everfit.io/pricing",
    checkedOn: "2026-09-04",
    positioning:
      "Modern and well-liked, with the same shape of pricing: a per-client-count plan plus separate add-ons.",
    plans: [
      { label: "Starter", monthly: "Free", clients: "up to 5 clients" },
      { label: "Pro", monthly: "$19–$290", clients: "5–300 clients, billed monthly" },
      { label: "Studio", monthly: "$105–$430", clients: "50–500 clients, billed monthly" },
      { label: "Enterprise", monthly: "Custom", clients: "500+ clients" },
    ],
    addOns: [
      { name: "Autoflow (automation)", monthly: "$24–$29" },
      { name: "Payments & packages", monthly: "$8–$9" },
      { name: "Meal plans & recipe books", monthly: "$33–$39" },
      { name: "On-demand collections", monthly: "$21–$25" },
    ],
    example: {
      clients: 50,
      base: "Pro at the 50-client tier",
      addOns: ["Autoflow (automation)", "Payments & packages", "Meal plans & recipe books"],
      note: "On-demand collections are included in Studio, extra on Pro.",
    },
  },
];

export function competitorBySlug(slug: string): Competitor | null {
  return COMPETITORS.find((c) => c.slug === slug) ?? null;
}

export function formatCheckedOn(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
