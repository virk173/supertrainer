import type { NotifyTemplate } from "./webhook-types";

// Phase 8.4 — dunning configuration + the SYSTEM-VOICE copy. Spec §9: the
// trainer never personally chases money — every payment message is from the
// system ("your plan is paused"), never the coach ("you owe me"). This copy is
// what the P6 delivery ladder renders for each payment notification.

export interface DunningConfig {
  /** Days of full access after the trainer-set capture window / grace override. */
  graceDays: number;
  /** Max days a client may pause (vacation) before billing must resume. */
  maxPauseDays: number;
}

// Sane org-level defaults (overridable via orgs.settings.dunning later).
export const DEFAULT_DUNNING: DunningConfig = {
  graceDays: 7,
  maxPauseDays: 60,
};

export interface SystemMessage {
  title: string;
  body: string;
  /** The one-tap action the card offers, if any. */
  cta?: string;
}

// Interface voice: sentence case, active, names what the CLIENT controls
// (their payment), never a person. No apology, no blame.
const COPY: Record<NotifyTemplate, SystemMessage> = {
  welcome: {
    title: "You’re in",
    body: "Your membership is active. Your coach will finalize your plan shortly.",
  },
  payment_failed: {
    title: "Your payment didn’t go through",
    body: "Update your card to keep your plan running — it only takes a moment.",
    cta: "Update payment",
  },
  payment_recovered: {
    title: "You’re all set",
    body: "Your payment went through and everything’s back on. Welcome back.",
  },
  plan_paused: {
    title: "Your plan is paused",
    body: "We paused your plan because a payment didn’t go through. Update your card to pick up right where you left off — your history is safe.",
    cta: "Update payment to resume",
  },
  subscription_canceled: {
    title: "Your membership has ended",
    body: "You’ll keep access until the end of your current period. You can restart anytime.",
  },
};

export function systemMessage(template: NotifyTemplate): SystemMessage {
  return COPY[template];
}

/** The timestamp a grace window (dunning override or cutover capture) expires. */
export function graceUntil(now: Date, days: number): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

/** True once a grace window has elapsed (uncaptured → hand to the dunning ladder). */
export function graceExpired(graceUntilIso: string | null, now: Date): boolean {
  if (!graceUntilIso) return false;
  return new Date(graceUntilIso).getTime() <= now.getTime();
}
