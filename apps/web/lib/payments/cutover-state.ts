// Phase 8.6 — the beta cutover state, PURE + tested. Every client onboarded
// during P2–P7 is active via the approved_manually stopgap (no subscription row).
// Cutover reuses the subscriptions row: the trainer starts it (status
// 'incomplete' + a grace window), the client keeps FULL access during the window,
// checkout flips them 'active' (captured), and an uncaptured window past its grace
// hands to the 8.4 dunning restricted state — never a hard cut mid-month.

export type CutoverState = "not_started" | "in_grace" | "captured" | "expired";

export interface CutoverInput {
  approvedManually: boolean;
  /** The client's subscription status, or null when no row exists yet. */
  subStatus: string | null;
  /** The capture-window end (subscriptions.grace_until), or null. */
  graceUntil: string | null;
  now: Date;
}

export function cutoverStatus(input: CutoverInput): CutoverState {
  const { subStatus, graceUntil, now } = input;

  // A live subscription = captured (a real paying client).
  if (subStatus === "active" || subStatus === "trialing") return "captured";

  // No row yet → the trainer hasn't started cutover for this client.
  if (subStatus == null) return "not_started";

  // Cutover started (row exists, not yet paid). Full access until grace expires.
  if (subStatus === "incomplete") {
    if (graceUntil && new Date(graceUntil).getTime() > now.getTime()) return "in_grace";
    return "expired";
  }

  // past_due / unpaid / canceled with no capture = the uncaptured/lapsed state.
  return "expired";
}

export interface CutoverProgress {
  notStarted: number;
  inGrace: number;
  captured: number;
  expired: number;
  total: number;
}

/** Aggregate a per-org cutover progress from a list of client states. */
export function summarizeCutover(states: CutoverState[]): CutoverProgress {
  const p: CutoverProgress = { notStarted: 0, inGrace: 0, captured: 0, expired: 0, total: states.length };
  for (const s of states) {
    if (s === "not_started") p.notStarted++;
    else if (s === "in_grace") p.inGrace++;
    else if (s === "captured") p.captured++;
    else p.expired++;
  }
  return p;
}
