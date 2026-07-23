// Golden split intakes (Phase 5.2). Ten diverse clients the pipeline must handle:
// beginner→advanced, 2→6 training days, home vs full gym, and the injury cases
// (shoulder impingement, ACL, lumbar disc) that must produce injury-safe splits.
// Used by BOTH the CI property test (pool safety + coded validation) and the live
// eval (real agents). Mirrors diet-pipeline/fixtures.ts.

import type { TrainingIntake } from "@supertrainer/training-engine";

import type { TrainingProfile } from "../style/schemas";

export interface GoldenSplitIntake {
  name: string;
  intake: TrainingIntake;
  styleProfile?: TrainingProfile;
}

export const GOLDEN_SPLIT_INTAKES: GoldenSplitIntake[] = [
  {
    name: "3-day beginner, home dumbbells, build muscle",
    intake: { daysPerWeek: 3, equipment: ["dumbbell", "bodyweight"], experience: "beginner", goal: "build_muscle", injuries: [] },
  },
  {
    name: "6-day advanced PPL, full gym, build muscle",
    intake: { daysPerWeek: 6, equipment: ["barbell", "dumbbell", "cable", "machine", "bodyweight"], experience: "advanced", goal: "build_muscle", injuries: [] },
    styleProfile: {
      daysPerWeek: 6,
      splitArchetypes: ["ppl"],
      exercisePool: ["barbell bench press", "barbell squat", "deadlift", "overhead press"],
      progressionStyle: "load",
      volumeRepHabits: "3-4 sets of 6-12 reps",
      warmupPatterns: "ramp-up sets on the first compound",
    },
  },
  {
    name: "4-day upper/lower, full gym, shoulder impingement",
    intake: { daysPerWeek: 4, equipment: ["barbell", "dumbbell", "cable", "machine", "bodyweight"], experience: "intermediate", goal: "recomp", injuries: ["shoulder impingement, painful overhead"] },
  },
  {
    name: "4-day, full gym, ACL reconstruction (knee)",
    intake: { daysPerWeek: 4, equipment: ["barbell", "dumbbell", "cable", "machine", "bodyweight"], experience: "intermediate", goal: "build_muscle", injuries: ["ACL reconstruction last year"] },
  },
  {
    name: "5-day, full gym, lumbar disc herniation",
    intake: { daysPerWeek: 5, equipment: ["barbell", "dumbbell", "cable", "machine", "bodyweight"], experience: "advanced", goal: "build_muscle", injuries: ["L5 disc herniation, avoid loaded spinal flexion"] },
  },
  {
    name: "2-day minimalist, full gym, general health",
    intake: { daysPerWeek: 2, equipment: ["barbell", "dumbbell", "cable", "machine", "bodyweight"], experience: "beginner", goal: "general_health", injuries: [] },
  },
  {
    name: "3-day bodyweight-only, no equipment, lose fat",
    intake: { daysPerWeek: 3, equipment: ["bodyweight"], experience: "beginner", goal: "lose_fat", injuries: [] },
  },
  {
    name: "5-day full gym, intermediate, strength focus",
    intake: { daysPerWeek: 5, equipment: ["barbell", "dumbbell", "cable", "machine", "bodyweight"], experience: "intermediate", goal: "strength", injuries: [] },
    styleProfile: {
      daysPerWeek: 5,
      splitArchetypes: ["upper/lower", "full body"],
      exercisePool: ["barbell squat", "barbell bench press", "deadlift", "barbell row"],
      progressionStyle: "load",
      volumeRepHabits: "4-5 sets of 3-6 reps on compounds",
      warmupPatterns: "extensive ramp-up on main lift",
    },
  },
  {
    name: "6-day advanced, full gym, tennis elbow",
    intake: { daysPerWeek: 6, equipment: ["barbell", "dumbbell", "cable", "machine", "bodyweight"], experience: "advanced", goal: "build_muscle", injuries: ["tennis elbow, gripping aggravates it"] },
  },
  {
    name: "4-day, dumbbell + bands at home, recomp",
    intake: { daysPerWeek: 4, equipment: ["dumbbell", "bands", "bodyweight"], experience: "intermediate", goal: "recomp", injuries: [] },
  },
];
