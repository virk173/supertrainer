// Trainer-lens pattern flags (Phase 3.5), computed nightly over a client's
// recent ledger days. Pure; the trainer UI (P7) reads the booleans/slope.

interface DayMet {
  weekday: number; // 0=Sun … 6=Sat
  met: boolean;
}

// Adherence collapses on weekends relative to weekdays (>=30pt gap), given
// enough weekend data to be meaningful.
export function weekendFaller(days: DayMet[]): boolean {
  const weekend = days.filter((d) => d.weekday === 0 || d.weekday === 6);
  const weekday = days.filter((d) => d.weekday >= 1 && d.weekday <= 5);
  if (weekend.length < 2 || weekday.length < 1) return false;
  const rate = (arr: DayMet[]) => arr.filter((d) => d.met).length / arr.length;
  return rate(weekend) <= rate(weekday) - 0.3;
}

// Half or more of the client's expected weigh-ins go unlogged (min 3 expected).
export function weighInAvoider(days: { expected: boolean; done: boolean }[]): boolean {
  const expected = days.filter((d) => d.expected);
  if (expected.length < 3) return false;
  const missed = expected.filter((d) => !d.done).length;
  return missed / expected.length >= 0.5;
}

// Least-squares slope of daily adherence scores over time; negative = decaying.
export function loggingDecaySlope(dailyScores: number[]): number {
  const n = dailyScores.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = dailyScores.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (dailyScores[i] - meanY);
    den += (i - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}
