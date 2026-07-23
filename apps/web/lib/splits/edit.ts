// Coded split-edit application (Phase 5.3). Pure transforms over a draft split's
// days — the trainer's review UI calls these, then the server action re-runs the
// coded validator (volume/balance in code, rule 4) and records a draft_edits row.
// Every edit returns a capture {path, before, after, edit_kind} for the P4.3
// style-learning loop (draft_edits with entity_type='split'). Mirrors
// lib/plans/edit.ts.

import type { PlannedExercise, SplitDay } from "@supertrainer/training-engine";

export type DraftEditKind = "swap" | "resize" | "add" | "remove" | "structure" | "rewrite";

export type SplitEdit =
  | { kind: "resize"; dayLabel: string; exerciseId: string; sets?: number; reps?: string; rir?: number }
  | { kind: "swap"; dayLabel: string; exerciseId: string; toExerciseId: string; sets?: number; reps?: string; rir?: number }
  | { kind: "add"; dayLabel: string; exerciseId: string; sets: number; reps: string; rir: number; tips?: string }
  | { kind: "remove"; dayLabel: string; exerciseId: string }
  | { kind: "reorder-exercises"; dayLabel: string; order: string[] }
  | { kind: "reorder-days"; order: string[] };

export interface EditCapture {
  path: string;
  before: unknown;
  after: unknown;
  edit_kind: DraftEditKind;
}

export interface ApplySplitEditResult {
  days: SplitDay[];
  capture: EditCapture;
}

export class SplitEditError extends Error {}

const clampSets = (n: number) => Math.max(1, Math.min(10, Math.round(n)));
const clampRir = (n: number) => Math.max(0, Math.min(5, Math.round(n)));

function clone(days: SplitDay[]): SplitDay[] {
  return JSON.parse(JSON.stringify(days)) as SplitDay[];
}

function findDay(days: SplitDay[], label: string): number {
  const i = days.findIndex((d) => d.label === label);
  if (i < 0) throw new SplitEditError(`day "${label}" not found`);
  return i;
}
function findExercise(day: SplitDay, exerciseId: string): number {
  const i = day.exercises.findIndex((e) => e.exercise_id === exerciseId);
  if (i < 0) throw new SplitEditError(`exercise ${exerciseId} not in day "${day.label}"`);
  return i;
}

export function applySplitEdit(input: SplitDay[], edit: SplitEdit): ApplySplitEditResult {
  const days = clone(input);

  if (edit.kind === "reorder-days") {
    const before = days.map((d) => d.label);
    const byLabel = new Map(days.map((d) => [d.label, d]));
    if (edit.order.length !== days.length || edit.order.some((l) => !byLabel.has(l))) {
      throw new SplitEditError("reorder-days: order must be a permutation of the day labels");
    }
    const next = edit.order.map((l) => byLabel.get(l)!);
    return { days: next, capture: { path: "days", before, after: edit.order, edit_kind: "structure" } };
  }

  const di = findDay(days, edit.dayLabel);
  const day = days[di];

  if (edit.kind === "reorder-exercises") {
    const before = day.exercises.map((e) => e.exercise_id);
    const byId = new Map(day.exercises.map((e) => [e.exercise_id, e]));
    if (edit.order.length !== day.exercises.length || edit.order.some((id) => !byId.has(id))) {
      throw new SplitEditError("reorder-exercises: order must be a permutation of the day's exercises");
    }
    day.exercises = edit.order.map((id) => byId.get(id)!);
    return {
      days,
      capture: { path: `days.${di}.exercises`, before, after: edit.order, edit_kind: "structure" },
    };
  }

  if (edit.kind === "add") {
    const after: PlannedExercise = {
      exercise_id: edit.exerciseId,
      sets: clampSets(edit.sets),
      reps: edit.reps,
      rir: clampRir(edit.rir),
      ...(edit.tips ? { tips: edit.tips } : {}),
    };
    day.exercises.push(after);
    return {
      days,
      capture: { path: `days.${di}.exercises.${day.exercises.length - 1}`, before: null, after, edit_kind: "add" },
    };
  }

  const ei = findExercise(day, edit.exerciseId);
  const before: PlannedExercise = { ...day.exercises[ei] };
  const path = `days.${di}.exercises.${ei}`;

  if (edit.kind === "remove") {
    day.exercises.splice(ei, 1);
    return { days, capture: { path, before, after: null, edit_kind: "remove" } };
  }

  if (edit.kind === "resize") {
    day.exercises[ei] = {
      ...before,
      ...(edit.sets != null ? { sets: clampSets(edit.sets) } : {}),
      ...(edit.reps != null ? { reps: edit.reps } : {}),
      ...(edit.rir != null ? { rir: clampRir(edit.rir) } : {}),
    };
    return { days, capture: { path, before, after: { ...day.exercises[ei] }, edit_kind: "resize" } };
  }

  // swap
  day.exercises[ei] = {
    ...before,
    exercise_id: edit.toExerciseId,
    ...(edit.sets != null ? { sets: clampSets(edit.sets) } : {}),
    ...(edit.reps != null ? { reps: edit.reps } : {}),
    ...(edit.rir != null ? { rir: clampRir(edit.rir) } : {}),
    // A swapped exercise loses the old exercise's cached video ref.
    video_ref: null,
  };
  return { days, capture: { path, before, after: { ...day.exercises[ei] }, edit_kind: "swap" } };
}

// Distill recurring edit patterns (swaps/removes above a threshold) into exemplar
// lines for the trainer's training style profile — the P4.3 learning loop, split
// side. Pure; the nightly job persists the result.
export interface SplitEditRow {
  edit_kind: DraftEditKind;
  before: unknown;
  after: unknown;
}
export function distillSplitEditPatterns(edits: SplitEditRow[], threshold = 2): string[] {
  const swaps = new Map<string, number>();
  const removes = new Map<string, number>();
  const idOf = (v: unknown): string | null => {
    if (v && typeof v === "object" && "exercise_id" in v) return String((v as { exercise_id: unknown }).exercise_id);
    return null;
  };
  for (const e of edits) {
    if (e.edit_kind === "swap") {
      const from = idOf(e.before);
      const to = idOf(e.after);
      if (from && to) swaps.set(`${from}→${to}`, (swaps.get(`${from}→${to}`) ?? 0) + 1);
    } else if (e.edit_kind === "remove") {
      const from = idOf(e.before);
      if (from) removes.set(from, (removes.get(from) ?? 0) + 1);
    }
  }
  const lines: string[] = [];
  for (const [pair, n] of swaps) if (n >= threshold) lines.push(`Frequently swaps ${pair} (${n}×)`);
  for (const [id, n] of removes) if (n >= threshold) lines.push(`Frequently removes ${id} (${n}×)`);
  return lines;
}
