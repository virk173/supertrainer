import { notFound } from "next/navigation";

import { muscleBounds, type MuscleGroup, type SplitDay } from "@supertrainer/training-engine";

import { getSessionClaims } from "@/lib/onboarding/state";
import { createServiceClient } from "@/lib/supabase/server";
import { approveSplitAction, editSplitAction, rejectSplitAction } from "./actions";

export const metadata = { title: "Review split — supertrainer" };

interface SplitMeta {
  archetype?: string;
  critique?: { styleMatchScore: number; practicalityFlags: string[]; balanceNotes: string } | null;
  needsAttention?: boolean;
  warnings?: string[];
  weeklyVolume?: Record<string, number>;
  balance?: { push: number; pull: number; ratio: number };
  injuryTags?: string[];
  injuryExcluded?: { id: string; name: string; reasons: string[] }[];
  validation?: { ok?: boolean } | null;
}

export default async function SplitReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId, role } = await getSessionClaims();
  if (!orgId || (role !== "owner" && role !== "staff")) notFound();

  const service = createServiceClient();
  const { data: split } = await service
    .from("splits")
    .select("id, org_id, status, days, schedule, meta, rationale")
    .eq("id", id)
    .maybeSingle();
  if (!split || split.org_id !== orgId) notFound();

  const days = (split.days ?? []) as unknown as SplitDay[];
  const meta = (split.meta ?? {}) as SplitMeta;
  const valid = meta.validation?.ok ?? !meta.needsAttention;

  // Catalog names for every exercise in the split.
  const ids = [...new Set(days.flatMap((d) => d.exercises.map((e) => e.exercise_id)))];
  const { data: exRows } = ids.length
    ? await service.from("exercises").select("id, name").in("id", ids)
    : { data: [] };
  const nameOf = (eid: string) => (exRows ?? []).find((e) => e.id === eid)?.name ?? eid;

  const weeklyVolume = meta.weeklyVolume ?? {};

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="metric-label">Training split review</p>
          <h1 className="text-2xl font-semibold tracking-tight">{meta.archetype ?? "Draft split"}</h1>
        </div>
        <span className="rounded-md bg-surface-raised px-2 py-1 text-sm capitalize text-muted-foreground">{split.status}</span>
      </header>

      {meta.needsAttention ? (
        <div className="rounded-[10px] border border-warning/40 bg-warning/10 p-4 text-sm" data-testid="needs-attention">
          <strong>Needs attention.</strong> The coded validator flagged this split — review the volume/balance below before approving.
        </div>
      ) : null}

      {meta.injuryTags && meta.injuryTags.length ? (
        <section className="rounded-[10px] border border-border bg-surface p-4" data-testid="injury-banner">
          <p className="metric-label">Injury-aware selection</p>
          <p className="text-sm">
            Client injuries: <span className="font-medium">{meta.injuryTags.map((t) => t.replace(/_/g, " ")).join(", ")}</span>
          </p>
          {meta.injuryExcluded && meta.injuryExcluded.length ? (
            <details className="mt-2 text-sm text-muted-foreground">
              <summary className="cursor-pointer">{meta.injuryExcluded.length} exercises auto-excluded</summary>
              <ul className="mt-1 list-disc pl-5">
                {meta.injuryExcluded.slice(0, 12).map((e) => (
                  <li key={e.id}>
                    {e.name} — {e.reasons.join("; ")}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      ) : null}

      {/* Volume meter per muscle */}
      <section className="rounded-[10px] border border-border bg-surface p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="metric-label">Weekly sets per muscle</p>
          {meta.balance ? (
            <p className="text-sm text-muted-foreground">
              push:pull <span className="metric">{meta.balance.push}</span>:<span className="metric">{meta.balance.pull}</span>
            </p>
          ) : null}
        </div>
        <div className="grid gap-1 sm:grid-cols-2" data-testid="volume-meter">
          {Object.entries(weeklyVolume).map(([muscle, sets]) => {
            const [min, max] = muscleBounds(muscle as MuscleGroup);
            const inRange = sets >= min && sets <= max;
            return (
              <div key={muscle} className="flex items-center justify-between gap-2 text-sm">
                <span className="capitalize text-muted-foreground">{muscle.replace(/_/g, " ")}</span>
                <span className={inRange ? "metric" : "metric text-warning"}>
                  {sets} <span className="text-xs text-muted-foreground">/ {min}–{max}</span>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Day-by-day editor */}
      <div className="grid gap-4 md:grid-cols-2">
        {days.map((day) => (
          <section key={day.label} className="rounded-[10px] border border-border bg-surface p-4" data-testid={`day-${day.label}`}>
            <h2 className="mb-2 text-lg font-semibold">{day.label}</h2>
            {day.warmup ? <p className="mb-2 text-sm text-muted-foreground">Warmup: {day.warmup}</p> : null}
            <ul className="space-y-2">
              {day.exercises.map((ex) => (
                <li key={ex.exercise_id} className="rounded-md bg-surface-raised p-2 text-sm">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="flex-1 truncate font-medium">{nameOf(ex.exercise_id)}</span>
                    {split.status === "draft" ? (
                      <form action={editSplitAction}>
                        <input type="hidden" name="splitId" value={split.id} />
                        <input type="hidden" name="kind" value="remove" />
                        <input type="hidden" name="dayLabel" value={day.label} />
                        <input type="hidden" name="exerciseId" value={ex.exercise_id} />
                        <button type="submit" aria-label={`Remove ${nameOf(ex.exercise_id)}`} className="rounded-[6px] border border-border px-1.5 py-0.5 text-xs text-danger hover:bg-danger/10">
                          ✕
                        </button>
                      </form>
                    ) : null}
                  </div>
                  {split.status === "draft" ? (
                    <form action={editSplitAction} className="flex items-center gap-2">
                      <input type="hidden" name="splitId" value={split.id} />
                      <input type="hidden" name="kind" value="resize" />
                      <input type="hidden" name="dayLabel" value={day.label} />
                      <input type="hidden" name="exerciseId" value={ex.exercise_id} />
                      <label className="text-xs text-muted-foreground">
                        sets
                        <input type="number" name="sets" defaultValue={ex.sets} min={1} max={10} aria-label={`${nameOf(ex.exercise_id)} sets`} className="ml-1 w-14 rounded-[6px] border border-border bg-background px-1 py-0.5 text-right" />
                      </label>
                      <label className="text-xs text-muted-foreground">
                        reps
                        <input type="text" name="reps" defaultValue={ex.reps} aria-label={`${nameOf(ex.exercise_id)} reps`} className="ml-1 w-16 rounded-[6px] border border-border bg-background px-1 py-0.5" />
                      </label>
                      <label className="text-xs text-muted-foreground">
                        RIR
                        <input type="number" name="rir" defaultValue={ex.rir} min={0} max={5} aria-label={`${nameOf(ex.exercise_id)} rir`} className="ml-1 w-12 rounded-[6px] border border-border bg-background px-1 py-0.5 text-right" />
                      </label>
                      <button type="submit" className="rounded-[6px] border border-border px-1.5 py-0.5 text-xs hover:bg-surface-raised">
                        save
                      </button>
                    </form>
                  ) : (
                    <p className="text-muted-foreground">
                      {ex.sets} × {ex.reps} @ RIR {ex.rir}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {meta.critique ? (
        <section className="rounded-[10px] border border-border bg-surface p-4">
          <p className="metric-label">Review notes</p>
          <p className="text-sm">
            Style match <span className="metric">{meta.critique.styleMatchScore}</span>/100 · {meta.critique.balanceNotes}
          </p>
        </section>
      ) : null}

      {split.status === "draft" ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <form action={approveSplitAction} className="flex-1">
            <input type="hidden" name="splitId" value={split.id} />
            <button type="submit" disabled={!valid} className="w-full rounded-[6px] bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-40">
              Approve split
            </button>
          </form>
          <form action={rejectSplitAction} className="flex-1 rounded-[10px] border border-border bg-surface p-3">
            <label className="metric-label" htmlFor="reject-note">
              Reject &amp; regenerate with a note
            </label>
            <textarea id="reject-note" name="note" rows={2} className="mt-1 w-full rounded-[6px] border border-border bg-background p-2 text-sm" placeholder="e.g. more pulling volume, swap leg press for hack squat" />
            <input type="hidden" name="splitId" value={split.id} />
            <button type="submit" className="mt-2 rounded-[6px] border border-border px-3 py-1.5 text-sm hover:bg-surface-raised">
              Reject &amp; regenerate
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
