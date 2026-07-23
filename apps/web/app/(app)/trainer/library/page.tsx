import { notFound } from "next/navigation";

import { exerciseIdsInSplit } from "@/lib/splits/activate";
import { coverageMeter, resolveVideo, type ExerciseVideo } from "@/lib/splits/videos";
import { getSessionClaims } from "@/lib/onboarding/state";
import { createServiceClient } from "@/lib/supabase/server";
import { setYoutubeVideoAction } from "./actions";
import type { SplitDay } from "@supertrainer/training-engine";

export const metadata = { title: "Video library — supertrainer" };

export default async function LibraryPage() {
  const { orgId, role } = await getSessionClaims();
  if (!orgId || (role !== "owner" && role !== "staff")) notFound();

  const service = createServiceClient();

  // Exercises across the org's ACTIVE splits — the switching-cost surface.
  const { data: splits } = await service
    .from("splits")
    .select("days")
    .eq("org_id", orgId)
    .eq("status", "approved");
  const activeIds = new Set<string>();
  for (const s of splits ?? []) {
    for (const eid of exerciseIdsInSplit((s.days ?? []) as unknown as SplitDay[])) activeIds.add(eid);
  }
  const ids = [...activeIds];

  const { data: exRows } = ids.length
    ? await service.from("exercises").select("id, name, primary_muscles").in("id", ids)
    : { data: [] };
  const { data: videoRows } = ids.length
    ? await service
        .from("exercise_videos")
        .select("exercise_id, org_id, kind, storage_path, youtube_id")
        .in("exercise_id", ids)
        .or(`org_id.is.null,org_id.eq.${orgId}`)
    : { data: [] };
  const videos = (videoRows ?? []) as ExerciseVideo[];
  const coverage = coverageMeter(ids, orgId, videos);

  return (
    <div className="space-y-6">
      <header>
        <p className="metric-label">Exercise video library</p>
        <h1 className="text-2xl font-semibold tracking-tight">Demo videos</h1>
      </header>

      <section className="rounded-[10px] border border-border bg-surface p-4" data-testid="coverage-meter">
        <p className="text-sm">
          Your library covers <span className="metric">{coverage.covered}</span>/<span className="metric">{coverage.total}</span> exercises in your active programs
          <span className="ml-2 text-muted-foreground">({coverage.pct}%)</span>
        </p>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-raised">
          <div className="h-full bg-success" style={{ width: `${coverage.pct}%` }} />
        </div>
      </section>

      {ids.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active programs yet — approve a split to populate your library.</p>
      ) : (
        <ul className="space-y-2">
          {(exRows ?? []).map((ex) => {
            const resolved = resolveVideo(ex.id, orgId, videos);
            return (
              <li key={ex.id} className="rounded-[10px] border border-border bg-surface p-3" data-testid={`lib-${ex.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{ex.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {resolved ? (
                        <span className={resolved.source === "org" ? "text-success" : ""}>
                          {resolved.source === "org" ? "Your video" : "Platform default"} · {resolved.kind}
                        </span>
                      ) : (
                        <span className="text-warning">No video — images + instructions shown</span>
                      )}
                    </p>
                  </div>
                </div>
                <form action={setYoutubeVideoAction} className="mt-2 flex items-center gap-2">
                  <input type="hidden" name="exerciseId" value={ex.id} />
                  <input
                    type="text"
                    name="youtube"
                    placeholder="Paste a YouTube link or id"
                    aria-label={`${ex.name} YouTube link`}
                    className="flex-1 rounded-[6px] border border-border bg-background px-2 py-1 text-sm"
                  />
                  <button type="submit" className="rounded-[6px] border border-border px-2 py-1 text-sm hover:bg-surface-raised">
                    Save
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
