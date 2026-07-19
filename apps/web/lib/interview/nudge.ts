// Idle-nudge eligibility for the Stage B interview (Phase 2.5). Pure and
// server-only-free so it's directly testable and reusable from Phase 6's job,
// which is what actually sends the nudge.
//
// "24h-idle gentle nudge (max 2)" — after two, we stop poking and leave it to
// the trainer.
export const MAX_NUDGES = 2;
const IDLE_MS = 24 * 60 * 60 * 1000;

export function isNudgeDue(
  lastPromptAt: string | null,
  nudgesSent: number,
  now = Date.now(),
): boolean {
  if (!lastPromptAt || nudgesSent >= MAX_NUDGES) return false;
  return now - new Date(lastPromptAt).getTime() >= IDLE_MS;
}
