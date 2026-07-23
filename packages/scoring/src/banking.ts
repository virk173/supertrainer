// Macro banking (Phase 3.5, org-toggle, default off). Eating under target banks
// the deficit (capped) into a weekly buffer spendable any day; going over draws
// the buffer down. Arithmetic in code, never the LLM (CLAUDE.md rule 4). Weekly
// reset at the client's Monday is handled by the caller passing only the current
// week's days.

export const BANKING_DEFAULT_CAP = 150;

// Kcal banked (or drawn, if negative) for one day: the under-target deficit
// capped at capPerDay; negative when over target.
export function bankDay(consumedKcal: number, targetKcal: number, capPerDay: number): number {
  return Math.min(capPerDay, targetKcal - consumedKcal);
}

// The weekly buffer after applying each day's bank in order, floored at 0 (you
// can't owe kcal into next week).
export function runningBuffer(dailyBanks: number[]): number {
  return dailyBanks.reduce((buffer, bank) => Math.max(0, buffer + bank), 0);
}

// Today's bank + the resulting buffer — drives the confirm-card copy
// ("banked 120 kcal → weekend buffer 340").
export function bufferAfterDay(
  prevBuffer: number,
  consumedKcal: number,
  targetKcal: number,
  capPerDay: number,
): { banked: number; buffer: number } {
  const banked = bankDay(consumedKcal, targetKcal, capPerDay);
  return { banked, buffer: Math.max(0, prevBuffer + banked) };
}
