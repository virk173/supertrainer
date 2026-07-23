// Deterministic injury → exercise exclusion map (Phase 5.1). This is the safety
// core of split generation, the training-side mirror of allergens.ts: the
// candidate exercise pool is filtered HERE, in code, BEFORE anything reaches the
// model — the selection agent can only ever pick from exercises that already
// passed this filter (ORIGINAL-SPEC injury-aware selection). Like the allergen
// net it is fail-closed: ambiguity errs toward EXCLUDING or CAUTIONING a
// movement, never silently allowing it.
//
// A trainer may override a specific exclusion for a specific client, but only
// through an explicit confirmation that is written to audit_log (recordInjuryOverride
// in packages/db) — the model can never widen an injured client's pool on its own.
//
// Movement patterns mirror the public.movement_pattern DB enum (and
// packages/db/scripts/classify-movement.ts). Kept as a local union so packages/ai
// stays independent of packages/db, exactly as the diet pipeline does.

export type MovementPattern =
  | "squat"
  | "hinge"
  | "lunge"
  | "push_h"
  | "push_v"
  | "pull_h"
  | "pull_v"
  | "carry"
  | "core"
  | "isolation";

export type InjuryTag =
  | "shoulder_impingement"
  | "rotator_cuff"
  | "lumbar_disc"
  | "low_back_general"
  | "knee_acl"
  | "patellar_tendinopathy"
  | "tennis_elbow"
  | "wrist"
  | "hip_labrum"
  | "hernia";

export const INJURY_TAGS: readonly InjuryTag[] = [
  "shoulder_impingement",
  "rotator_cuff",
  "lumbar_disc",
  "low_back_general",
  "knee_acl",
  "patellar_tendinopathy",
  "tennis_elbow",
  "wrist",
  "hip_labrum",
  "hernia",
];

interface InjuryRule {
  tag: InjuryTag;
  label: string;
  // Free-text fragments (from the intake's injury history) that select this
  // injury. Substring match, deliberately broad — over-selecting only
  // over-restricts, the safe direction.
  synonyms: string[];
  // Hard EXCLUDE any exercise carrying one of these movement patterns…
  excludedPatterns: MovementPattern[];
  // …or whose normalized name contains one of these fragments (catches lifts a
  // pattern misses, e.g. "behind the neck", "upright row", "box jump").
  excludedNameFragments: string[];
  // Allowed but FLAGGED for the trainer (progress with care).
  cautionPatterns: MovementPattern[];
  cautionNameFragments: string[];
}

const INJURY_RULES: InjuryRule[] = [
  {
    tag: "shoulder_impingement",
    label: "Shoulder impingement",
    // Generic "shoulder" issues map here — the most movement-restricting
    // shoulder diagnosis, the conservative (fail-closed) default.
    synonyms: ["impingement", "shoulder impinge", "shoulder pain", "shoulder injury", "subacromial"],
    excludedPatterns: ["push_v"],
    excludedNameFragments: [
      "overhead", "behind the neck", "behind neck", "military", "upright row",
      "push press", "snatch", "jerk", "dip",
    ],
    cautionPatterns: ["push_h"],
    cautionNameFragments: ["incline", "lateral raise", "front raise", "bench press"],
  },
  {
    tag: "rotator_cuff",
    label: "Rotator cuff",
    synonyms: ["rotator cuff", "rotator", "supraspinatus", "cuff tear", "cuff strain"],
    excludedPatterns: ["push_v"],
    excludedNameFragments: [
      "overhead", "behind the neck", "behind neck", "upright row", "snatch",
      "jerk", "military",
    ],
    cautionPatterns: ["push_h", "pull_v"],
    cautionNameFragments: ["dip", "pullover", "lateral raise", "bench press"],
  },
  {
    tag: "lumbar_disc",
    label: "Lumbar disc (herniation)",
    synonyms: ["disc", "herniat", "slipped disc", "bulging disc", "sciatica", "l4", "l5", "s1"],
    // Loaded spinal flexion is the danger — hinge patterns + flexion core work.
    excludedPatterns: ["hinge"],
    excludedNameFragments: [
      "deadlift", "good morning", "bent over", "bent-over", "sit-up", "sit up",
      "crunch", "russian twist", "jefferson", "stiff leg", "stiff-leg", "toes to bar",
    ],
    cautionPatterns: ["squat", "carry"],
    cautionNameFragments: ["back extension", "hyperextension", "overhead", "standing press", "leg press"],
  },
  {
    tag: "low_back_general",
    label: "Low back (non-specific)",
    synonyms: ["low back", "lower back", "lumbar", "back pain", "back ache"],
    excludedPatterns: [],
    excludedNameFragments: ["good morning", "jefferson", "stiff leg", "stiff-leg"],
    cautionPatterns: ["hinge", "squat"],
    cautionNameFragments: ["deadlift", "bent over", "bent-over", "sit-up", "crunch", "back extension", "overhead"],
  },
  {
    tag: "knee_acl",
    label: "Knee (ACL)",
    synonyms: ["acl", "anterior cruciate"],
    // Jumping / cutting / pivoting and open-chain terminal extension are the risk.
    excludedPatterns: [],
    excludedNameFragments: ["jump", "plyo", "depth", "bound", "hop", "skater", "sprint", "pistol"],
    cautionPatterns: ["squat", "lunge"],
    cautionNameFragments: ["leg extension", "sissy", "step-up", "step up", "deep squat", "split squat", "leg press"],
  },
  {
    tag: "patellar_tendinopathy",
    label: "Patellar tendinopathy (jumper's knee)",
    synonyms: ["patellar", "patella", "jumper", "knee cap", "chondromalacia", "runner's knee", "runners knee"],
    excludedPatterns: [],
    excludedNameFragments: ["jump", "plyo", "depth", "box jump", "bound", "hop", "sprint"],
    cautionPatterns: ["squat", "lunge"],
    cautionNameFragments: ["leg extension", "sissy", "deep squat", "split squat", "leg press", "step-up"],
  },
  {
    tag: "tennis_elbow",
    label: "Tennis / golfer's elbow (epicondylitis)",
    synonyms: ["tennis elbow", "golfer's elbow", "golfers elbow", "lateral epicond", "medial epicond", "epicondylitis", "elbow"],
    excludedPatterns: [],
    excludedNameFragments: ["wrist curl", "wrist extension", "reverse curl", "reverse wrist"],
    cautionPatterns: ["pull_h", "pull_v"],
    cautionNameFragments: ["curl", "row", "pulldown", "pull-up", "pullup", "chin", "deadlift", "grip", "hammer"],
  },
  {
    tag: "wrist",
    label: "Wrist",
    synonyms: ["wrist", "carpal"],
    excludedPatterns: [],
    excludedNameFragments: ["wrist curl", "wrist extension", "handstand", "planche"],
    cautionPatterns: ["push_h", "push_v"],
    cautionNameFragments: ["push-up", "pushup", "push up", "front squat", "clean", "plank", "curl", "press", "dip"],
  },
  {
    tag: "hip_labrum",
    label: "Hip labrum / FAI",
    synonyms: ["labrum", "labral", "fai", "hip impinge", "hip flexor tear"],
    excludedPatterns: [],
    excludedNameFragments: ["deep squat", "atg", "pistol", "sissy", "jefferson"],
    cautionPatterns: ["squat", "lunge", "hinge"],
    cautionNameFragments: ["squat", "lunge", "deadlift", "leg press", "hip thrust", "step-up", "split squat"],
  },
  {
    tag: "hernia",
    label: "Abdominal / inguinal hernia",
    synonyms: ["hernia", "inguinal", "abdominal wall", "umbilical"],
    // Direct trunk flexion under load; heavy valsalva movements cautioned.
    excludedPatterns: [],
    excludedNameFragments: [
      "sit-up", "sit up", "crunch", "leg raise", "russian twist", "v-up", "v up",
      "toes to bar", "hanging leg", "dragon flag",
    ],
    cautionPatterns: ["squat", "hinge", "carry", "core"],
    cautionNameFragments: ["deadlift", "squat", "overhead", "carry", "plank", "press"],
  },
];

// The exercise shape this module can assess (exercises rows + pipeline candidates
// both match).
export interface ExerciseLike {
  name_normalized: string;
  movement_patterns: MovementPattern[];
}

export type ExclusionStatus = "ok" | "caution" | "excluded";

export interface ExclusionReason {
  injury: InjuryTag;
  kind: "pattern" | "name";
  detail: string; // the pattern or name fragment that matched
}

export interface ExclusionVerdict {
  status: ExclusionStatus;
  excludedBy: ExclusionReason[];
  cautionBy: ExclusionReason[];
}

// Injury tags implied by a client's free-text injury history. Substring match,
// so "torn ACL last year" → knee_acl, "L5 disc herniation" → lumbar_disc,
// "shoulder pain when pressing" → shoulder_impingement.
export function resolveInjuryTags(injuries: string[]): Set<InjuryTag> {
  const tags = new Set<InjuryTag>();
  for (const raw of injuries) {
    const s = raw.toLowerCase().trim();
    if (!s) continue;
    for (const rule of INJURY_RULES) {
      if (rule.synonyms.some((syn) => s.includes(syn))) tags.add(rule.tag);
    }
  }
  return tags;
}

// Assess one exercise against a client's injuries. Excluded wins over caution
// wins over ok. Reasons are accumulated across every matching injury so the
// trainer's injury banner can explain exactly what was auto-excluded and why.
export function assessExercise(
  exercise: ExerciseLike,
  injuries: string[],
): ExclusionVerdict {
  const tags = resolveInjuryTags(injuries);
  const name = exercise.name_normalized.toLowerCase();
  const patterns = new Set(exercise.movement_patterns);
  const excludedBy: ExclusionReason[] = [];
  const cautionBy: ExclusionReason[] = [];

  for (const rule of INJURY_RULES) {
    if (!tags.has(rule.tag)) continue;
    for (const p of rule.excludedPatterns) {
      if (patterns.has(p)) excludedBy.push({ injury: rule.tag, kind: "pattern", detail: p });
    }
    for (const frag of rule.excludedNameFragments) {
      if (name.includes(frag)) excludedBy.push({ injury: rule.tag, kind: "name", detail: frag });
    }
    for (const p of rule.cautionPatterns) {
      if (patterns.has(p)) cautionBy.push({ injury: rule.tag, kind: "pattern", detail: p });
    }
    for (const frag of rule.cautionNameFragments) {
      if (name.includes(frag)) cautionBy.push({ injury: rule.tag, kind: "name", detail: frag });
    }
  }

  const status: ExclusionStatus =
    excludedBy.length > 0 ? "excluded" : cautionBy.length > 0 ? "caution" : "ok";
  return { status, excludedBy, cautionBy };
}

export interface AssessedExercise<T> {
  exercise: T;
  status: ExclusionStatus;
  caution: boolean;
  reasons: string[]; // human-readable, for the injury banner / cue flags
}

export interface FilteredPool<T> {
  allowed: AssessedExercise<T>[]; // status ok OR caution (caution===true) OR overridden
  excluded: AssessedExercise<T>[];
}

function humanReasons(v: ExclusionVerdict, labelOf: (t: InjuryTag) => string): string[] {
  const src = v.status === "excluded" ? v.excludedBy : v.cautionBy;
  return [...new Set(src.map((r) => `${labelOf(r.injury)}: ${r.detail.replace(/_/g, " ")}`))];
}

function labelOf(tag: InjuryTag): string {
  return INJURY_RULES.find((r) => r.tag === tag)?.label ?? tag;
}

// Split a candidate pool into the exercises an injured client may be given
// (allowed, some flagged caution) and those auto-excluded. `overriddenIds` are
// exercise identities the trainer has explicitly un-excluded (via the audited
// confirmation path) — they move to `allowed`, always flagged caution so the
// override stays visible in the UI. `idOf` extracts the identity used to match
// overrides (exercise id, or name for pipeline candidates).
export function filterExercisePool<T extends ExerciseLike>(
  exercises: T[],
  injuries: string[],
  options: { overriddenIds?: Set<string>; idOf?: (e: T) => string } = {},
): FilteredPool<T> {
  const overridden = options.overriddenIds ?? new Set<string>();
  const idOf = options.idOf ?? ((e: T) => e.name_normalized);
  const allowed: AssessedExercise<T>[] = [];
  const excluded: AssessedExercise<T>[] = [];

  for (const e of exercises) {
    const v = assessExercise(e, injuries);
    if (v.status === "excluded") {
      if (overridden.has(idOf(e))) {
        allowed.push({
          exercise: e,
          status: "caution",
          caution: true,
          reasons: ["Trainer override — " + humanReasons(v, labelOf).join("; ")],
        });
      } else {
        excluded.push({ exercise: e, status: "excluded", caution: false, reasons: humanReasons(v, labelOf) });
      }
    } else {
      allowed.push({
        exercise: e,
        status: v.status,
        caution: v.status === "caution",
        reasons: v.status === "caution" ? humanReasons(v, labelOf) : [],
      });
    }
  }
  return { allowed, excluded };
}

// Human-readable labels for the taxonomy (intake pick-list + injury banner).
export function injuryLabels(): { tag: InjuryTag; label: string }[] {
  return INJURY_RULES.map((r) => ({ tag: r.tag, label: r.label }));
}
