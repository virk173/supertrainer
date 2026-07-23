// @supertrainer/scoring — pure two-lens adherence scoring (Phase 3.5).
export {
  SCORE_WEIGHTS,
  weeklyAdherenceScore,
  scoreBand,
  type DayScore,
  type ScoreBand,
} from "./score";
export { streakCount, comebackStreakDisplay } from "./streak";
export { BANKING_DEFAULT_CAP, bankDay, runningBuffer, bufferAfterDay } from "./banking";
export { weekendFaller, weighInAvoider, loggingDecaySlope } from "./patterns";
