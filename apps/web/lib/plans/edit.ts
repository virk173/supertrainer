// Coded plan-edit application (Phase 4.3). Pure transforms over a draft plan's
// content — the trainer's review UI calls these, then the server action
// re-validates macros in code (rule 4) and records a draft_edits row. Every edit
// returns a capture {path, before, after, edit_kind} for the learning loop.

import type { PlannedDayType, PlannedItem, PlannedMeal } from "@supertrainer/nutrition-engine";

export interface PlanContentVersion {
  label: string;
  dayTypes: PlannedDayType[];
  validation?: unknown;
  autofilled?: boolean;
}
export interface PlanContent {
  versions: PlanContentVersion[];
  [key: string]: unknown;
}

export type DraftEditKind = "swap" | "resize" | "add" | "remove" | "structure" | "rewrite";

export type PlanEdit =
  | { kind: "resize"; versionLabel: string; dayType: string; slot: string; foodId: string; grams: number }
  | { kind: "swap"; versionLabel: string; dayType: string; slot: string; foodId: string; toFoodId: string; grams?: number }
  | { kind: "add"; versionLabel: string; dayType: string; slot: string; foodId: string; grams: number }
  | { kind: "remove"; versionLabel: string; dayType: string; slot: string; foodId: string };

export interface EditCapture {
  path: string;
  before: unknown;
  after: unknown;
  edit_kind: DraftEditKind;
}

export interface ApplyEditResult {
  content: PlanContent;
  capture: EditCapture;
}

export class PlanEditError extends Error {}

const clampGrams = (g: number) => Math.max(1, Math.min(1000, Math.round(g)));

function locate(content: PlanContent, e: { versionLabel: string; dayType: string; slot: string }) {
  const vi = content.versions.findIndex((v) => v.label === e.versionLabel);
  if (vi < 0) throw new PlanEditError(`version ${e.versionLabel} not found`);
  const di = content.versions[vi].dayTypes.findIndex((d) => d.name === e.dayType);
  if (di < 0) throw new PlanEditError(`day type ${e.dayType} not found`);
  const mi = content.versions[vi].dayTypes[di].meals.findIndex((m) => m.slot === e.slot);
  if (mi < 0) throw new PlanEditError(`slot ${e.slot} not found`);
  return { vi, di, mi };
}

const pathOf = (vi: number, di: number, mi: number, ii?: number) =>
  `versions.${vi}.dayTypes.${di}.meals.${mi}` + (ii != null ? `.items.${ii}` : "");

// Deep-clone the content so callers never mutate the stored object in place.
function clone(content: PlanContent): PlanContent {
  return JSON.parse(JSON.stringify(content)) as PlanContent;
}

export function applyPlanEdit(input: PlanContent, edit: PlanEdit): ApplyEditResult {
  const content = clone(input);
  const { vi, di, mi } = locate(content, edit);
  const meal: PlannedMeal = content.versions[vi].dayTypes[di].meals[mi];

  const findItem = (foodId: string): number => meal.items.findIndex((it) => it.food_id === foodId);

  if (edit.kind === "resize") {
    const ii = findItem(edit.foodId);
    if (ii < 0) throw new PlanEditError(`item ${edit.foodId} not in meal`);
    const before: PlannedItem = { ...meal.items[ii] };
    meal.items[ii] = { ...before, grams: clampGrams(edit.grams) };
    return { content, capture: { path: pathOf(vi, di, mi, ii), before, after: { ...meal.items[ii] }, edit_kind: "resize" } };
  }

  if (edit.kind === "swap") {
    const ii = findItem(edit.foodId);
    if (ii < 0) throw new PlanEditError(`item ${edit.foodId} not in meal`);
    const before: PlannedItem = { ...meal.items[ii] };
    meal.items[ii] = {
      ...before,
      food_id: edit.toFoodId,
      grams: edit.grams != null ? clampGrams(edit.grams) : before.grams,
    };
    return { content, capture: { path: pathOf(vi, di, mi, ii), before, after: { ...meal.items[ii] }, edit_kind: "swap" } };
  }

  if (edit.kind === "add") {
    const after: PlannedItem = { food_id: edit.foodId, grams: clampGrams(edit.grams) };
    meal.items.push(after);
    return { content, capture: { path: pathOf(vi, di, mi, meal.items.length - 1), before: null, after, edit_kind: "add" } };
  }

  // remove
  const ii = findItem(edit.foodId);
  if (ii < 0) throw new PlanEditError(`item ${edit.foodId} not in meal`);
  const before: PlannedItem = { ...meal.items[ii] };
  meal.items.splice(ii, 1);
  return { content, capture: { path: pathOf(vi, di, mi, ii), before, after: null, edit_kind: "remove" } };
}
