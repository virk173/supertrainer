// Streaks + the 3-day comeback (Phase 3.5). dailyMet is ordered oldest -> newest.

// Consecutive all-expectations-met days ending today (the most recent element).
export function streakCount(dailyMet: boolean[]): number {
  let n = 0;
  for (let i = dailyMet.length - 1; i >= 0; i--) {
    if (!dailyMet[i]) break;
    n++;
  }
  return n;
}

// After a break, three good days restore the streak visual at a reduced count so
// a slip doesn't erase all the client's progress (exact spec:
// streak_display = floor(previous_streak / 2) + comeback_days).
export function comebackStreakDisplay(previousStreak: number, comebackDays: number): number {
  return Math.floor(previousStreak * 0.5) + comebackDays;
}
