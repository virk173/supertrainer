// Phase 9.5 — what we charge, in ONE place.
//
// ⚠️ THESE NUMBERS ARE PLACEHOLDERS AND MUST BE CONFIRMED BEFORE THE SITE GOES
// PUBLIC. They are positioned against the competitor stack documented in
// ./competitors.ts (all-inclusive vs. base + add-ons), not derived from a
// margin model. Every price the site shows comes from here, so changing them is
// one edit — and the launch runbook lists this file as a blocking decision.

export interface PlanTier {
  band: "20" | "50" | "100" | "unlimited";
  name: string;
  /** monthly price in cents, billed monthly */
  monthlyCents: number;
  /** monthly price in cents when billed annually */
  annualMonthlyCents: number;
  clients: string;
  best?: boolean;
}

export const PLANS: readonly PlanTier[] = [
  {
    band: "20",
    name: "Solo",
    monthlyCents: 8900,
    annualMonthlyCents: 7900,
    clients: "Up to 20 clients",
  },
  {
    band: "50",
    name: "Full book",
    monthlyCents: 14900,
    annualMonthlyCents: 12900,
    clients: "Up to 50 clients",
    best: true,
  },
  {
    band: "100",
    name: "Scaling",
    monthlyCents: 22900,
    annualMonthlyCents: 19900,
    clients: "Up to 100 clients",
  },
  {
    band: "unlimited",
    name: "Studio",
    monthlyCents: 34900,
    annualMonthlyCents: 29900,
    clients: "Unlimited clients",
  },
];

/** Everything is in every plan. The list exists to be checked against a
 *  competitor's add-on menu, so each line names a thing they charge extra for. */
export const INCLUDED = [
  "Nutrition coaching and meal plans",
  "AI drafted replies in your voice",
  "Automated check-ins and reminders",
  "Client payments and subscriptions",
  "Branded client portal on your own domain",
  "Progress photos, weigh-ins, and wearables",
  "Adherence forensics and client reports",
  "Full data export, any time",
] as const;

export function money(cents: number): string {
  return `$${Math.round(cents / 100)}`;
}
