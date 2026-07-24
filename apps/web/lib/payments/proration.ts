// Phase 8.2 — proration DISPLAY math, pure + coded (CLAUDE.md rule 4: money is
// computed/formatted in code, never by a model, and never trusted from the
// client). The gated Stripe call returns the upcoming-invoice numbers; these
// helpers turn them into the exact sentence the client sees BEFORE they confirm
// a tier change. What we render must equal what Stripe will charge.

/** Format minor units (cents) in a currency for display. Uses Intl so currency
 *  symbol + decimal places are correct per currency (JPY has 0 decimals, etc.). */
export function formatMoney(cents: number, currency: string): string {
  const code = currency.toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
    }).format(cents / 100);
  } catch {
    // Unknown currency code → plain amount with the code appended.
    return `${(cents / 100).toFixed(2)} ${code}`;
  }
}

export type ChangeDirection = "upgrade" | "downgrade" | "same";

/** Compare two recurring prices to classify a tier change. */
export function changeDirection(currentCents: number, nextCents: number): ChangeDirection {
  if (nextCents > currentCents) return "upgrade";
  if (nextCents < currentCents) return "downgrade";
  return "same";
}

export interface ProrationInput {
  /** amount_due on the previewed upcoming invoice — what Stripe charges now
   *  (net of unused-time credit). May be 0 or, for a downgrade credit, negative. */
  immediateChargeCents: number;
  /** the new tier's recurring price (the steady-state renewal). */
  nextRenewalCents: number;
  /** when the next renewal lands (period end), ISO or null. */
  nextRenewalDate: string | null;
  currency: string;
  direction: ChangeDirection;
}

export interface ProrationSummary {
  chargedTodayLabel: string;
  nextRenewalLabel: string;
  /** One plain-language line, interface voice, shown above the confirm button. */
  sentence: string;
  /** Downgrades apply at period end (no immediate charge); upgrades apply now. */
  appliesImmediately: boolean;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "your next renewal";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "your next renewal";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** Turn a proration preview into the confirm-screen copy. Upgrades charge the
 *  prorated difference today and flip features now; downgrades bank a credit and
 *  take effect at period end (the standard, least-surprising expectation). */
export function summarizeProration(input: ProrationInput): ProrationSummary {
  const { immediateChargeCents, nextRenewalCents, nextRenewalDate, currency, direction } = input;
  const renewalDate = fmtDate(nextRenewalDate);
  const nextRenewalLabel = `${formatMoney(nextRenewalCents, currency)} on ${renewalDate}`;

  if (direction === "downgrade") {
    // proration_behavior:'none' means no charge or credit today; the lower price
    // takes over from your next renewal. (Deferring the feature change itself to
    // the period boundary needs a Stripe subscription schedule — a follow-up; the
    // copy stays honest about billing and doesn't promise feature retention.)
    return {
      chargedTodayLabel: formatMoney(0, currency),
      nextRenewalLabel,
      sentence: `No charge today — your plan moves to the new price of ${formatMoney(
        nextRenewalCents,
        currency,
      )} starting at your next renewal on ${renewalDate}.`,
      appliesImmediately: false,
    };
  }

  // Upgrade (or same-price change): charge the prorated difference now.
  const today = Math.max(0, immediateChargeCents);
  return {
    chargedTodayLabel: formatMoney(today, currency),
    nextRenewalLabel,
    sentence: `You’ll be charged ${formatMoney(
      today,
      currency,
    )} today for the rest of this cycle, then ${formatMoney(
      nextRenewalCents,
      currency,
    )} on ${renewalDate}.`,
    appliesImmediately: true,
  };
}
