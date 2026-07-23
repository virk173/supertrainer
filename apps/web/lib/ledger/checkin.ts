// Phase 3.3 — gym check-in status rule (pure, tested). The one-tap card only
// exists for rest/missed days: if the client logged any working sets that day,
// the check-in is AUTO-SATISFIED to 'trained' regardless of what (if anything)
// they tapped. Kept as a pure function so day-close (P3.4) and the write action
// share one source of truth.

export type CheckinStatus = "trained" | "rest" | "missed";

export function resolveCheckinStatus(
  requested: CheckinStatus | null,
  hasWorkoutSets: boolean,
): CheckinStatus {
  if (hasWorkoutSets) return "trained";
  return requested ?? "missed";
}

// kg is the stored/canonical unit. The client may enter lb; convert here so the
// ledger is always kg (P3.5 scoring + P7 charts read kg).
export function toKg(value: number, unit: "kg" | "lb"): number {
  const kg = unit === "lb" ? value * 0.45359237 : value;
  return Math.round(kg * 100) / 100;
}

export function fromKg(kg: number, unit: "kg" | "lb"): number {
  const v = unit === "lb" ? kg / 0.45359237 : kg;
  return Math.round(v * 10) / 10;
}
