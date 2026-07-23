// Exercise-video resolution + coverage (Phase 5.3). An org's own demo overrides
// the platform default at render time (spec §5.3), and the library manager shows
// a coverage meter — "your library covers 34/48 exercises in your active
// programs" (the switching-cost nudge, ORIGINAL-SPEC §7). Pure so it's unit-tested.

// Pull an 11-char YouTube id out of a URL (watch/youtu.be/embed/shorts) or accept
// a raw id. Used by the library manager's "paste a link" field.
export function parseYoutubeId(input: string): string | null {
  const s = input.trim();
  const m =
    s.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/) ??
    s.match(/^([A-Za-z0-9_-]{11})$/);
  return m ? m[1] : null;
}

export interface ExerciseVideo {
  exercise_id: string;
  org_id: string | null; // null = platform default
  kind: "upload" | "youtube";
  storage_path: string | null;
  youtube_id: string | null;
}

export interface ResolvedVideo {
  kind: "upload" | "youtube";
  ref: string; // storage_path or youtube_id
  source: "org" | "platform";
}

// The winning video for an exercise: the caller org's own override beats a
// platform default; null if neither exists (falls back to catalog images).
export function resolveVideo(
  exerciseId: string,
  orgId: string,
  videos: ExerciseVideo[],
): ResolvedVideo | null {
  const forExercise = videos.filter((v) => v.exercise_id === exerciseId);
  const pick = (v: ExerciseVideo, source: "org" | "platform"): ResolvedVideo => ({
    kind: v.kind,
    ref: v.kind === "upload" ? (v.storage_path ?? "") : (v.youtube_id ?? ""),
    source,
  });
  const orgVideo = forExercise.find((v) => v.org_id === orgId);
  if (orgVideo) return pick(orgVideo, "org");
  const platform = forExercise.find((v) => v.org_id === null);
  if (platform) return pick(platform, "platform");
  return null;
}

export interface CoverageMeter {
  covered: number;
  total: number;
  pct: number; // 0-100, rounded
  uncovered: string[]; // exercise ids with no video
}

// Video coverage across the exercises in a client's active programs: how many
// have SOME video (org override or platform default) available to the caller org.
export function coverageMeter(
  exerciseIds: Iterable<string>,
  orgId: string,
  videos: ExerciseVideo[],
): CoverageMeter {
  const ids = [...new Set(exerciseIds)];
  const uncovered: string[] = [];
  let covered = 0;
  for (const id of ids) {
    if (resolveVideo(id, orgId, videos)) covered += 1;
    else uncovered.push(id);
  }
  const total = ids.length;
  return { covered, total, pct: total ? Math.round((covered / total) * 100) : 0, uncovered };
}
