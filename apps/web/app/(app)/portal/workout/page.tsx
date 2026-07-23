import { redirect } from "next/navigation";

import { WorkoutLogger, type PlannedExercise, type PreviousSet } from "@/components/workout-logger";
import { getCurrentClientContext, tzDate } from "@/lib/ledger/log";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Workout — supertrainer" };

export default async function WorkoutPage() {
  const ctx = await getCurrentClientContext();
  if (!ctx) redirect("/portal");
  const service = createServiceClient();
  const day = tzDate(ctx.timezone);

  // Today's scheduled exercises from the active split (empty until P5.3 fills it).
  const { data: split } = await service
    .from("splits_active")
    .select("days, schedule")
    .eq("client_id", ctx.clientId)
    .maybeSingle();

  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0-6 for the local date
  const schedule = (split?.schedule ?? {}) as unknown as Record<string, string>;
  const days = (split?.days ?? {}) as unknown as Record<string, PlannedExercise[]>;
  const dayKey = schedule[String(weekday)];
  const planned: PlannedExercise[] = dayKey && Array.isArray(days[dayKey]) ? days[dayKey] : [];

  // Previous-session values (most recent day before today) per exercise, for the
  // ghosted placeholders + "same as last time".
  const { data: recent } = await service
    .from("workout_logs")
    .select("exercise_id, set_number, weight_kg, reps, tz_date")
    .eq("client_id", ctx.clientId)
    .lt("tz_date", day)
    .order("tz_date", { ascending: false })
    .limit(200);

  const previous: Record<string, PreviousSet[]> = {};
  const lastDateFor: Record<string, string> = {};
  for (const r of recent ?? []) {
    // Keep only the single most-recent date's sets per exercise.
    if (lastDateFor[r.exercise_id] && lastDateFor[r.exercise_id] !== r.tz_date) continue;
    lastDateFor[r.exercise_id] = r.tz_date;
    (previous[r.exercise_id] ??= []).push({
      setNumber: r.set_number,
      weightKg: r.weight_kg != null ? Number(r.weight_kg) : null,
      reps: r.reps,
    });
  }
  for (const k of Object.keys(previous)) previous[k].sort((a, b) => a.setNumber - b.setNumber);

  return <WorkoutLogger planned={planned} previous={previous} />;
}
