// Tier model, template ladder, and formatting shared by the builder (client)
// and the save action (server). The AI floor is constant across every tier and
// defined here so the builder and the client-facing card stay in sync.

export const CHECKIN_FREQUENCIES = [
  "none",
  "biweekly",
  "weekly",
  "daily",
] as const;
export type CheckinFrequency = (typeof CHECKIN_FREQUENCIES)[number];

export interface TierFeatures {
  checkin_frequency: CheckinFrequency;
  video_calls_per_month: number;
  response_priority: boolean;
  custom_lines: string[];
}

export interface TierInput {
  id?: string;
  name: string;
  price_cents: number;
  currency: string;
  features: TierFeatures;
}

export const MAX_TIERS = 6;
export const MIN_TIERS = 1;

// On EVERY tier, not editable (spec §8 — the data engine needs daily
// interaction from every client, so AI is the floor).
export const AI_FLOOR: readonly string[] = [
  "Daily AI check-ins",
  "Meal logging & macro tracking",
  "Adherence tracking",
  "Monthly plan reviews",
];

export const CHECKIN_LABELS: Record<CheckinFrequency, string> = {
  none: "AI check-ins only",
  biweekly: "Personal check-in every 2 weeks",
  weekly: "Weekly personal check-in",
  daily: "Daily personal replies",
};

function emptyFeatures(checkin: CheckinFrequency): TierFeatures {
  return {
    checkin_frequency: checkin,
    video_calls_per_month: 0,
    response_priority: false,
    custom_lines: [],
  };
}

// Pre-filled ladder shown when an org has no tiers yet (spec §8 example).
export function templateLadder(currency = "usd"): TierInput[] {
  return [
    { name: "Basic", price_cents: 9900, currency, features: emptyFeatures("none") },
    { name: "Silver", price_cents: 14900, currency, features: emptyFeatures("biweekly") },
    { name: "Gold", price_cents: 19900, currency, features: emptyFeatures("weekly") },
    {
      name: "Platinum",
      price_cents: 29900,
      currency,
      features: {
        checkin_frequency: "daily",
        video_calls_per_month: 1,
        response_priority: true,
        custom_lines: [],
      },
    },
  ];
}

// The human-attention lines a tier sells beyond the AI floor.
export function tierHighlightLines(features: TierFeatures): string[] {
  const lines: string[] = [CHECKIN_LABELS[features.checkin_frequency]];
  if (features.video_calls_per_month > 0) {
    const n = features.video_calls_per_month;
    lines.push(`${n} video call${n === 1 ? "" : "s"} / month`);
  }
  if (features.response_priority) lines.push("Priority response access");
  for (const line of features.custom_lines) {
    if (line.trim()) lines.push(line.trim());
  }
  return lines;
}

export function formatPrice(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(0)}`;
  }
}

export interface TierError {
  index: number;
  message: string;
}

// Structural validation for the save action + inline builder feedback.
export function validateTiers(tiers: TierInput[]): TierError[] {
  const errors: TierError[] = [];
  if (tiers.length < MIN_TIERS) {
    errors.push({ index: 0, message: "Keep at least one tier." });
  }
  tiers.forEach((tier, index) => {
    if (!tier.name.trim()) errors.push({ index, message: "Every tier needs a name." });
    if (!Number.isInteger(tier.price_cents) || tier.price_cents < 0) {
      errors.push({ index, message: "Price must be zero or more." });
    }
  });
  return errors;
}
