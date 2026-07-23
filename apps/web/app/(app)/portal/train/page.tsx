import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentClientContext, tzDate } from "@/lib/ledger/log";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Today's session — supertrainer" };

interface ActiveExercise {
  exercise_id: string;
  name: string;
  target_sets: number;
  target_reps: string;
  target_rir: number;
  video_ref: { kind: "upload" | "youtube"; ref: string } | null;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function TrainPage() {
  const ctx = await getCurrentClientContext();
  if (!ctx) redirect("/portal");
  const service = createServiceClient();
  const day = tzDate(ctx.timezone);
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();

  const { data: split } = await service
    .from("splits_active")
    .select("days, schedule")
    .eq("client_id", ctx.clientId)
    .maybeSingle();
  const schedule = (split?.schedule ?? {}) as unknown as Record<string, string>;
  const daysMap = (split?.days ?? {}) as unknown as Record<string, ActiveExercise[]>;
  const dayKey = schedule[String(weekday)];
  const exercises: ActiveExercise[] = dayKey && Array.isArray(daysMap[dayKey]) ? daysMap[dayKey] : [];

  // Catalog instructions + images for today's exercises (the fallback demo when
  // there's no video), + the last logged date per exercise (the "ghost").
  const ids = exercises.map((e) => e.exercise_id);
  const { data: catalog } = ids.length
    ? await service.from("exercises").select("id, instructions, image_paths").in("id", ids)
    : { data: [] };
  const catalogById = new Map((catalog ?? []).map((c) => [c.id, c]));

  const { data: recent } = ids.length
    ? await service
        .from("workout_logs")
        .select("exercise_id, weight_kg, reps, tz_date")
        .eq("client_id", ctx.clientId)
        .lt("tz_date", day)
        .order("tz_date", { ascending: false })
        .limit(300)
    : { data: [] };
  const ghost = new Map<string, { weightKg: number | null; reps: number | null; date: string }>();
  for (const r of recent ?? []) {
    if (!ghost.has(r.exercise_id)) {
      ghost.set(r.exercise_id, { weightKg: r.weight_kg != null ? Number(r.weight_kg) : null, reps: r.reps, date: r.tz_date });
    }
  }

  if (!dayKey) {
    return (
      <div className="space-y-4">
        <header>
          <p className="metric-label">{WEEKDAY_LABELS[weekday]}</p>
          <h1 className="text-2xl font-semibold tracking-tight">Rest day</h1>
        </header>
        <p className="text-sm text-muted-foreground">No training scheduled today — recover well.</p>
        <Link href="/portal/workout" className="inline-block rounded-[6px] border border-border px-3 py-1.5 text-sm hover:bg-surface-raised">
          Log an unscheduled session
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <p className="metric-label">{WEEKDAY_LABELS[weekday]} · today&apos;s session</p>
          <h1 className="text-2xl font-semibold tracking-tight">{dayKey}</h1>
        </div>
        <Link href="/portal/workout" className="rounded-[6px] bg-foreground px-3 py-1.5 text-sm font-medium text-background" data-testid="log-session">
          Log session
        </Link>
      </header>

      <ol className="space-y-3" data-testid="session-exercises">
        {exercises.map((ex) => {
          const cat = catalogById.get(ex.exercise_id);
          const g = ghost.get(ex.exercise_id);
          return (
            <li key={ex.exercise_id} className="rounded-[10px] border border-border bg-surface p-3" data-testid={`ex-${ex.exercise_id}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{ex.name}</p>
                <span className="metric text-sm">
                  {ex.target_sets} × {ex.target_reps} <span className="text-xs text-muted-foreground">@ RIR {ex.target_rir}</span>
                </span>
              </div>

              {ex.video_ref?.kind === "youtube" ? (
                <div className="mt-2 aspect-video overflow-hidden rounded-[6px]">
                  {/* privacy-enhanced embed */}
                  <iframe
                    className="h-full w-full"
                    src={`https://www.youtube-nocookie.com/embed/${ex.video_ref.ref}`}
                    title={`${ex.name} demo`}
                    allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                </div>
              ) : cat?.instructions && cat.instructions.length ? (
                <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm text-muted-foreground">
                  {cat.instructions.slice(0, 3).map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              ) : null}

              {g ? (
                <p className="mt-2 text-xs text-muted-foreground" data-testid={`ghost-${ex.exercise_id}`}>
                  Last time ({g.date}): {g.weightKg != null ? `${g.weightKg} kg` : "—"} × {g.reps ?? "—"}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
