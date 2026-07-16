import type { Database } from "@supertrainer/db/types";

// The checklist steps, in recommended order. Steps are completable in any
// order; this array defines the display order and the canonical set. The enum
// is the source of truth (public.onboarding_step) — keep in sync.
export type OnboardingStep = Database["public"]["Enums"]["onboarding_step"];
export type OnboardingStepStatus =
  Database["public"]["Enums"]["onboarding_step_status"];

export interface StepConfig {
  step: OnboardingStep;
  title: string;
  /** One-line summary shown on the collapsed card. */
  summary: string;
  /** Longer copy shown when the card is expanded. */
  detail: string;
  /** Label for the deep-link into the step's own flow. */
  cta: string;
  /** Route the step deep-links to (built out across Phase 1.2–1.7). */
  href: string;
  /** Whether "Skip for now" is offered. Style ingestion is never skippable. */
  skippable: boolean;
}

export const ONBOARDING_STEPS: readonly StepConfig[] = [
  {
    step: "brand",
    title: "Set up your brand",
    summary: "Logo, colors, and your coaching handle.",
    detail:
      "Your brand shows up on client teaser pages, plan PDFs, and the portal. You can refine it any time.",
    cta: "Set up brand",
    href: "/onboarding/brand",
    skippable: true,
  },
  {
    step: "style",
    title: "Teach the AI your coaching style",
    summary: "Upload past plans and check-ins — the moat.",
    detail:
      "Drop in old diet plans, training splits, and check-in screenshots. The AI learns how you program and how you talk, then you confirm what it got right. This powers every draft it ever writes for you.",
    cta: "Start style ingestion",
    href: "/onboarding/style",
    skippable: false,
  },
  {
    step: "tiers",
    title: "Build your coaching tiers",
    summary: "Name, price, and shape your packages.",
    detail:
      "Start from a template ladder and rename, reprice, and edit features. Tiers become your client-facing offer and, later, your Stripe products.",
    cta: "Build tiers",
    href: "/onboarding/tiers",
    skippable: true,
  },
  {
    step: "import",
    title: "Import your clients",
    summary: "Bring your roster over from your old tool.",
    detail:
      "Upload a CSV or spreadsheet from Trainerize, Everfit, TrueCoach, or your own sheet. We map the columns and import as leads — no invites go out until you send them.",
    cta: "Import clients",
    href: "/onboarding/import",
    skippable: true,
  },
  {
    step: "demo",
    title: "Meet your demo client",
    summary: "Explore the product with realistic data.",
    detail:
      "Alex Demo comes pre-loaded so every screen has something to show while you get set up. Excluded from analytics and billing, and resettable any time.",
    cta: "Explore demo client",
    href: "/onboarding/demo",
    skippable: false,
  },
  {
    step: "invite",
    title: "Send your first invite",
    summary: "Bring a real client into the funnel.",
    detail:
      "Generate a branded, tokenized invite link or email it to a client. This kicks off their onboarding and starts your funnel.",
    cta: "Send an invite",
    href: "/onboarding/invite",
    skippable: false,
  },
] as const;

export const ONBOARDING_STEP_ORDER: readonly OnboardingStep[] =
  ONBOARDING_STEPS.map((s) => s.step);

export function isOnboardingStep(value: string): value is OnboardingStep {
  return ONBOARDING_STEP_ORDER.includes(value as OnboardingStep);
}

export function getStepConfig(step: OnboardingStep): StepConfig {
  const config = ONBOARDING_STEPS.find((s) => s.step === step);
  if (!config) throw new Error(`Unknown onboarding step: ${step}`);
  return config;
}

// A step counts as resolved once it is done or explicitly skipped; onboarding
// is complete when every step is resolved. Absent rows read as 'todo'.
export function isStepResolved(status: OnboardingStepStatus): boolean {
  return status === "done" || status === "skipped";
}

export type OnboardingStateMap = Record<OnboardingStep, OnboardingStepStatus>;

export function emptyStateMap(): OnboardingStateMap {
  return ONBOARDING_STEP_ORDER.reduce((acc, step) => {
    acc[step] = "todo";
    return acc;
  }, {} as OnboardingStateMap);
}

export function isOnboardingComplete(state: OnboardingStateMap): boolean {
  return ONBOARDING_STEP_ORDER.every((step) => isStepResolved(state[step]));
}

export function resolvedStepCount(state: OnboardingStateMap): number {
  return ONBOARDING_STEP_ORDER.filter((step) =>
    isStepResolved(state[step]),
  ).length;
}
