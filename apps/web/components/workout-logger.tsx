"use client";

import { useState } from "react";
import { Check, Plus, RotateCcw } from "lucide-react";

import { logWorkoutAction } from "@/app/(app)/portal/actions";
import { registerHandler, runOrQueue } from "@/lib/offline/queue";

registerHandler("workout", (p) => logWorkoutAction(p as Parameters<typeof logWorkoutAction>[0]));

export interface PlannedExercise {
  exerciseId: string;
  name: string;
  targetSets: number;
  targetReps: string | null;
}

export interface PreviousSet {
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
}

interface SetRow {
  weight: string;
  reps: string;
}
interface ExerciseRows {
  exerciseId: string;
  name: string;
  targetReps: string | null;
  sets: SetRow[];
}

function seed(planned: PlannedExercise[]): ExerciseRows[] {
  return planned.map((p) => ({
    exerciseId: p.exerciseId,
    name: p.name,
    targetReps: p.targetReps,
    sets: Array.from({ length: Math.max(1, p.targetSets) }, () => ({ weight: "", reps: "" })),
  }));
}

export function WorkoutLogger({
  planned,
  previous,
}: {
  planned: PlannedExercise[];
  previous: Record<string, PreviousSet[]>;
}) {
  const [exercises, setExercises] = useState<ExerciseRows[]>(seed(planned));
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patchSet(ei: number, si: number, patch: Partial<SetRow>) {
    setExercises((prev) =>
      prev.map((ex, i) =>
        i === ei ? { ...ex, sets: ex.sets.map((s, j) => (j === si ? { ...s, ...patch } : s)) } : ex,
      ),
    );
    setSaved(false);
  }

  function addSet(ei: number) {
    setExercises((prev) => prev.map((ex, i) => (i === ei ? { ...ex, sets: [...ex.sets, { weight: "", reps: "" }] } : ex)));
  }

  function sameAsLast(ei: number) {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== ei) return ex;
        const last = previous[ex.exerciseId];
        if (!last?.length) return ex;
        return {
          ...ex,
          sets: last.map((s) => ({ weight: s.weightKg != null ? String(s.weightKg) : "", reps: s.reps != null ? String(s.reps) : "" })),
        };
      }),
    );
    setSaved(false);
  }

  function addExercise() {
    const name = newName.trim();
    if (!name) return;
    const exerciseId = `custom:${name.toLowerCase().replace(/\s+/g, "-")}`;
    setExercises((prev) => {
      // Skip a duplicate id — two rows with the same exercise_id collide on the
      // React key AND on the upsert's (client,tz,exercise_id,set_number) key,
      // which would overwrite the first exercise's sets.
      if (prev.some((e) => e.exerciseId === exerciseId)) return prev;
      return [...prev, { exerciseId, name, targetReps: null, sets: [{ weight: "", reps: "" }] }];
    });
    setNewName("");
  }

  async function save() {
    if (busy) return;
    // Parse to a finite number or null (a stray "12,5" would otherwise become
    // NaN, be rejected by the server Zod schema, and fail the whole save).
    const num = (v: string): number | null => {
      if (v.trim() === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const sets = exercises.flatMap((ex) =>
      ex.sets
        .map((s, idx) => ({ s, idx }))
        .filter(({ s }) => s.weight !== "" || s.reps !== "")
        .map(({ s, idx }) => ({
          exerciseId: ex.exerciseId,
          exerciseName: ex.name,
          setNumber: idx + 1,
          weightKg: num(s.weight),
          reps: num(s.reps),
        })),
    );
    if (sets.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await runOrQueue("workout", { sets });
      setSaved(true);
    } catch {
      setError("Couldn't save your workout — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="workout-logger">
      <h1 className="text-xl font-semibold tracking-tight">Workout</h1>
      {planned.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No split scheduled for today yet — add the exercises you did.
        </p>
      )}

      {exercises.map((ex, ei) => {
        const prev = previous[ex.exerciseId];
        return (
          <div key={ex.exerciseId} className="space-y-2 rounded-lg border bg-surface-raised p-3" data-testid="workout-exercise">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {ex.name}
                {ex.targetReps && <span className="ml-2 text-xs text-muted-foreground">target {ex.targetReps}</span>}
              </p>
              {prev?.length ? (
                <button type="button" onClick={() => sameAsLast(ei)} data-testid="same-as-last" className="flex items-center gap-1 text-xs text-muted-foreground underline">
                  <RotateCcw className="size-3" /> Same as last
                </button>
              ) : null}
            </div>
            {ex.sets.map((s, si) => (
              <div key={si} className="flex items-center gap-2">
                <span className="w-10 text-xs text-muted-foreground">Set {si + 1}</span>
                <input
                  inputMode="decimal"
                  data-testid="set-weight"
                  value={s.weight}
                  onChange={(e) => patchSet(ei, si, { weight: e.target.value })}
                  placeholder={prev?.[si]?.weightKg != null ? `${prev[si].weightKg} kg` : "kg"}
                  className="h-11 w-20 rounded-lg border bg-surface p-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
                <input
                  inputMode="numeric"
                  data-testid="set-reps"
                  value={s.reps}
                  onChange={(e) => patchSet(ei, si, { reps: e.target.value })}
                  placeholder={prev?.[si]?.reps != null ? `${prev[si].reps} reps` : "reps"}
                  className="h-11 w-20 rounded-lg border bg-surface p-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            ))}
            <button type="button" onClick={() => addSet(ei)} className="flex items-center gap-1 text-xs text-muted-foreground">
              <Plus className="size-3" /> Add set
            </button>
          </div>
        );
      })}

      <div className="flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addExercise()}
          placeholder="Add an exercise…"
          data-testid="add-exercise-name"
          className="flex-1 rounded-lg border bg-surface-raised p-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
        />
        <button type="button" onClick={addExercise} data-testid="add-exercise" className="rounded-lg border bg-surface-raised p-2">
          <Plus className="size-5" />
        </button>
      </div>

      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

      <button
        type="button"
        data-testid="workout-save"
        onClick={save}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-3 text-sm font-medium text-background disabled:opacity-50"
      >
        <Check className="size-4" /> {saved ? "Saved" : "Save workout"}
      </button>
    </div>
  );
}
