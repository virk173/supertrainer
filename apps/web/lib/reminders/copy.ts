import type { ReminderKind } from "./decide";

// Phase 3.6 — reminder copy bank. Personal-feeling, in the coach's name, one tap
// to answer (ORIGINAL-SPEC §10). Hard char limit so a push/SMS never truncates.
// Deterministic by default; a later enhancement can wrap this with light AI
// personalization (modelRouter 'parse', voice profile from P1) and re-clamp to
// REMINDER_CHAR_LIMIT — the template is always the safe fallback.

export const REMINDER_CHAR_LIMIT = 140;

export function reminderCopy(kind: ReminderKind, trainerName?: string | null): string {
  const coach = trainerName?.trim() || "Your coach";
  const bank: Record<ReminderKind, string> = {
    meal: `${coach} here — how did your last meal go? Tap to log it.`,
    weigh_in: `${coach} here — quick weigh-in when you get a moment?`,
    checkin: `${coach} here — did you train today? One tap to check in.`,
    custom: `${coach} here — just checking in on you today.`,
  };
  return bank[kind].slice(0, REMINDER_CHAR_LIMIT);
}
