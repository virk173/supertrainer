// Phase 9.4 — when a referral earns its credit, as a pure function.
//
// A growth loop that pays on signup pays for fraud. This decides, from facts
// only — never a promise, never a model — whether a referral has become real,
// and says WHY when it hasn't, so a trainer waiting on a credit gets an answer
// rather than silence.

/** Free months the referrer earns; the referred org gets extra trial instead. */
export const REFERRER_CREDIT_MONTHS = 1;
export const REFERRED_TRIAL_EXTRA_DAYS = 30;

export interface ReferralFacts {
  referrerOrgId: string;
  referredOrgId: string | null;
  /** the referred org finished the P1 onboarding checklist */
  referredOnboardingComplete: boolean;
  /** the referred org has at least one paying, non-demo client */
  referredPayingClients: number;
  /** orgs that referred the REFERRER — used to catch a circular loop */
  referrerWasReferredBy: string[];
  /** referrals this referrer already has in flight or credited, this window */
  referrerCreditedThisMonth: number;
}

export type ReferralVerdict =
  | { decision: "credit"; referrerMonths: number; referredTrialDays: number }
  | { decision: "reject"; reason: string }
  | { decision: "wait"; reason: string };

/** At most this many credited referrals per referrer per month. Not a punishment
 *  for a genuinely popular coach — a ceiling on how fast a farm can mint credit
 *  before a person looks at it. */
export const MONTHLY_CREDIT_CAP = 5;

export function creditDecision(facts: ReferralFacts): ReferralVerdict {
  if (!facts.referredOrgId) {
    return { decision: "wait", reason: "Nobody has signed up through this link yet." };
  }

  // ── abuse guards, cheapest and most certain first ──────────────────────────
  if (facts.referredOrgId === facts.referrerOrgId) {
    return { decision: "reject", reason: "You can’t refer yourself." };
  }
  if (facts.referrerWasReferredBy.includes(facts.referredOrgId)) {
    return { decision: "reject", reason: "These two orgs referred each other." };
  }
  if (facts.referrerCreditedThisMonth >= MONTHLY_CREDIT_CAP) {
    return {
      decision: "reject",
      reason: `That’s ${MONTHLY_CREDIT_CAP} credited referrals this month — the rest carry over after a look.`,
    };
  }

  // ── the bar: a real, working customer ──────────────────────────────────────
  if (!facts.referredOnboardingComplete) {
    return { decision: "wait", reason: "They’re still setting up their workspace." };
  }
  if (facts.referredPayingClients < 1) {
    return { decision: "wait", reason: "Waiting on their first paying client." };
  }

  return {
    decision: "credit",
    referrerMonths: REFERRER_CREDIT_MONTHS,
    referredTrialDays: REFERRED_TRIAL_EXTRA_DAYS,
  };
}

/** A short, unambiguous code. No vowels: nothing it generates can read as a word,
 *  and nothing a person reads aloud collides with 0/O or 1/I. */
const ALPHABET = "23456789BCDFGHJKLMNPQRSTVWXYZ";

export function generateCode(random: () => number = Math.random, length = 8): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[Math.floor(random() * ALPHABET.length)];
  }
  return out;
}

export function normalizeCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
}
