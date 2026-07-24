// Phase 8.5 — pure video-call credit math (no server imports, testable). The
// grant/record readers live in ./calcom (server-only).

/** Credits left this month (never negative). */
export function creditsRemaining(total: number, used: number): number {
  return Math.max(0, total - used);
}

/** First-of-month date string (UTC) for the credit period. */
export function periodMonth(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
