// Coded monthly progression (Phase 5.4). Pure, coded reasoning — the LLM never
// decides the numbers (rule 4). The client's ACTUAL logged performance drives the
// change: hit the top of the rep range → add load; stalled for 3 sessions →
// deload or rotate (per the trainer's progression style); regressing → hold and
// check recovery; no data → a conservative hold. Every rule emits a plain-English
// reason the trainer sees before approving. Mirrors nutrition-engine proposeAdjustment.

export type ProgressionStyle = "load" | "volume" | "rotation" | "mixed" | "unknown";

// One session's TOP set for an exercise (heaviest working set that day).
export interface ExerciseSession {
  tzDate: string;
  weightKg: number;
  reps: number;
}

export interface ProgressionContext {
  exerciseId: string;
  name: string;
  // Chronological (oldest→newest) top sets this cycle.
  sessions: ExerciseSession[];
  currentSets: number;
  // Top of the prescribed rep range, e.g. "8-12" → 12.
  repTop: number;
}

export type ProgressionKind = "add_load" | "add_reps" | "add_set" | "deload" | "rotate" | "hold";

export interface ProgressionProposal {
  exerciseId: string;
  changeKind: ProgressionKind;
  newSets: number;
  // Multiplicative load change, e.g. 1.025 = +2.5%, 0.9 = −10% (bounded ±10%).
  loadFactor: number;
  reason: string;
}

const MAX_LOAD_STEP = 1.1; // never +10% in a cycle
const DELOAD_FACTOR = 0.9; // −10% on a stall
const LOAD_STEP = 1.025; // default progressive-overload step
const MAX_SETS_PER_EXERCISE = 6;
const STALL_SESSIONS = 3;

// Epley estimated 1RM — the single number we track a top set's progress by.
export function estimated1RM(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}

// Parse "8-12" / "8 to 12" / "10" → the top of the range.
export function parseRepTop(reps: string): number {
  const nums = reps.match(/\d+/g);
  if (!nums || nums.length === 0) return 12;
  return Math.max(...nums.map(Number));
}

interface Trend {
  best: number; // best e1RM this cycle
  sessionsSinceBest: number; // trailing sessions with no new best
  regressing: boolean; // recent e1RM trending down off the peak
}

function analyzeTrend(sessions: ExerciseSession[]): Trend {
  const e1rms = sessions.map((s) => estimated1RM(s.weightKg, s.reps));
  let best = -Infinity;
  let bestIdx = -1;
  e1rms.forEach((v, i) => {
    if (v > best) {
      best = v;
      bestIdx = i;
    }
  });
  const sessionsSinceBest = e1rms.length - 1 - bestIdx;
  // Regressing: the most recent session is >5% below the cycle best AND below
  // the previous session (a genuine downtrend, not noise).
  const last = e1rms[e1rms.length - 1];
  const prev = e1rms.length >= 2 ? e1rms[e1rms.length - 2] : last;
  const regressing = last < best * 0.95 && last < prev;
  return { best, sessionsSinceBest, regressing };
}

export function proposeProgression(
  ctx: ProgressionContext,
  style: ProgressionStyle,
): ProgressionProposal {
  const hold = (reason: string): ProgressionProposal => ({
    exerciseId: ctx.exerciseId,
    changeKind: "hold",
    newSets: ctx.currentSets,
    loadFactor: 1,
    reason,
  });

  // No / thin data → conservative hold (a questionnaire check-in feeds this for
  // non-logging clients).
  if (ctx.sessions.length < 2) {
    return hold(`${ctx.name}: not enough logged sessions this cycle — holding and checking in.`);
  }

  const trend = analyzeTrend(ctx.sessions);
  const last = ctx.sessions[ctx.sessions.length - 1];

  // Regressing → hold + recovery flag (never push into a downtrend).
  if (trend.regressing) {
    return hold(`${ctx.name}: performance dipped off the cycle best — holding to check recovery/technique.`);
  }

  // Stalled (no new best for STALL_SESSIONS) → deload or rotate per style.
  if (trend.sessionsSinceBest >= STALL_SESSIONS) {
    if (style === "rotation") {
      return {
        exerciseId: ctx.exerciseId,
        changeKind: "rotate",
        newSets: ctx.currentSets,
        loadFactor: 1,
        reason: `${ctx.name}: stalled ${trend.sessionsSinceBest} sessions — rotate to a variation to break the plateau.`,
      };
    }
    return {
      exerciseId: ctx.exerciseId,
      changeKind: "deload",
      newSets: ctx.currentSets,
      loadFactor: DELOAD_FACTOR,
      reason: `${ctx.name}: stalled ${trend.sessionsSinceBest} sessions — deload 10% and rebuild.`,
    };
  }

  // Progressing and hit the TOP of the rep range → advance per style.
  if (last.reps >= ctx.repTop) {
    if (style === "volume") {
      const newSets = Math.min(MAX_SETS_PER_EXERCISE, ctx.currentSets + 1);
      if (newSets > ctx.currentSets) {
        return {
          exerciseId: ctx.exerciseId,
          changeKind: "add_set",
          newSets,
          loadFactor: 1,
          reason: `${ctx.name}: hit the top of the range — add a set (volume progression).`,
        };
      }
    }
    if (style === "rotation") {
      return {
        exerciseId: ctx.exerciseId,
        changeKind: "rotate",
        newSets: ctx.currentSets,
        loadFactor: 1,
        reason: `${ctx.name}: hit the top of the range — rotate to keep it fresh.`,
      };
    }
    // load / mixed / unknown → add load, bounded to +10%.
    return {
      exerciseId: ctx.exerciseId,
      changeKind: "add_load",
      newSets: ctx.currentSets,
      loadFactor: Math.min(MAX_LOAD_STEP, LOAD_STEP),
      reason: `${ctx.name}: hit the top of the range — add ~2.5% load next block.`,
    };
  }

  // Still climbing within the range → keep going, add reps.
  return {
    exerciseId: ctx.exerciseId,
    changeKind: "add_reps",
    newSets: ctx.currentSets,
    loadFactor: 1,
    reason: `${ctx.name}: progressing within the range — keep adding reps toward the top.`,
  };
}
