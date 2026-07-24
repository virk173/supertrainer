import { cardByKind, type CardTemplate } from "@/lib/cards/bank";

// Phase 6.5 — the smart check-in picker (pure). Fills a client's DATA GAP with at
// most one card, honouring the frequency caps and quiet hours. Returns null when
// there's no gap (never nag a client who's already giving us data) or a cap is hit.

export const MAX_PER_DAY = 1;
export const MAX_PER_WEEK = 3;
// The no-sleep-data gap only fires after a real streak of missing nights.
export const NO_SLEEP_GAP_DAYS = 5;

export interface CardGaps {
  /** Consecutive recent days with no sleep data. */
  noSleepDays: number;
  /** Adherence has dropped vs the prior window. */
  adherenceDropped: boolean;
  /** The client is in a planned deload week. */
  deloadWeek: boolean;
  /** A P5 non-logger — give the questionnaire fallback. */
  nonLogger: boolean;
}

export interface CardPickerInput {
  gaps: CardGaps;
  sentToday: number;
  sentThisWeek: number;
  isQuietHours: boolean;
}

export function pickCard(input: CardPickerInput): CardTemplate | null {
  // Caps + quiet hours short-circuit before any gap analysis.
  if (input.isQuietHours) return null;
  if (input.sentToday >= MAX_PER_DAY) return null;
  if (input.sentThisWeek >= MAX_PER_WEEK) return null;

  const g = input.gaps;
  // Highest-value gap first. A non-logger gives us nothing, so their questionnaire
  // outranks the specific gaps; then the concrete data gaps in impact order.
  if (g.nonLogger) return cardByKind("questionnaire") ?? null;
  if (g.noSleepDays >= NO_SLEEP_GAP_DAYS) return cardByKind("sleep") ?? null;
  if (g.adherenceDropped) return cardByKind("motivation") ?? null;
  if (g.deloadWeek) return cardByKind("soreness") ?? null;

  return null; // no gap → no card
}
