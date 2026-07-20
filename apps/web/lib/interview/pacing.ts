// Day-pacing for the Stage B interview (Phase 2.5). Day 1 is the day they start;
// sections unlock across days 1–3. Extracted so the interview engine and the
// stall-nudge tick share one definition.
export function dayNumber(startedAt: string, now: number = Date.now()): number {
  const days = Math.floor((now - new Date(startedAt).getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(1, days + 1);
}
