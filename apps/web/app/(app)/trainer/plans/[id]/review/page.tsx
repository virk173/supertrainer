import { notFound } from "next/navigation";

import { macrosForGrams, type FoodMacroRow } from "@supertrainer/nutrition-engine";

import { getSessionClaims } from "@/lib/onboarding/state";
import type { PlanContent } from "@/lib/plans/edit";
import { createServiceClient } from "@/lib/supabase/server";
import { approvePlanAction, editPlanItemAction, rejectPlanAction } from "./actions";

export const metadata = { title: "Review plan — supertrainer" };

type DayTypeValidation = {
  dayType: string;
  actual: { kcal: number; protein_g: number };
  target: { kcal: number; protein_g: number };
  ok: boolean;
};

export default async function PlanReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId, role } = await getSessionClaims();
  if (!orgId || (role !== "owner" && role !== "staff")) notFound();

  const service = createServiceClient();
  const { data: plan } = await service
    .from("plans")
    .select("id, org_id, client_id, status, content, day_types")
    .eq("id", id)
    .maybeSingle();
  if (!plan || plan.org_id !== orgId) notFound();

  const content = plan.content as PlanContent & {
    critique?: { styleMatchScore: number; practicalityFlags: string[]; varietyNotes: string } | null;
    needsAttention?: boolean;
  };
  const versions = content.versions ?? [];

  // Food names + macro rows for every id in the plan.
  const ids = [
    ...new Set(versions.flatMap((v) => v.dayTypes.flatMap((d) => d.meals.flatMap((m) => m.items.map((i) => i.food_id))))),
  ];
  const { data: foods } = ids.length
    ? await service.from("foods").select("id, name, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g").in("id", ids)
    : { data: [] };
  const foodById = new Map((foods ?? []).map((f) => [f.id, f]));
  const nameOf = (fid: string) => foodById.get(fid)?.name ?? fid;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="metric-label">Diet plan review</p>
          <h1 className="text-2xl font-semibold tracking-tight">Review draft</h1>
        </div>
        <span className="rounded-md bg-surface-raised px-2 py-1 text-sm capitalize text-muted-foreground">{plan.status}</span>
      </header>

      {content.needsAttention ? (
        <div className="rounded-[10px] border border-warning/40 bg-warning/10 p-4 text-sm">
          <strong>Needs attention.</strong> Some day types couldn&apos;t be auto-filled to target and were filled deterministically — review the portions.
        </div>
      ) : null}

      {content.critique ? (
        <section className="rounded-[10px] border border-border bg-surface p-4">
          <p className="metric-label">Review notes</p>
          <p className="text-sm">
            Style match <span className="metric">{content.critique.styleMatchScore}</span>/100 · {content.critique.varietyNotes}
          </p>
          {content.critique.practicalityFlags.length ? (
            <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
              {content.critique.practicalityFlags.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {versions.map((v) => {
          const validation = (v.validation as { dayTypes?: DayTypeValidation[]; ok?: boolean } | undefined) ?? {};
          const valid = validation.ok ?? false;
          return (
            <section key={v.label} className="rounded-[10px] border border-border bg-surface p-4" data-testid={`version-${v.label}`}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Version {v.label}</h2>
                <span className={`text-sm ${valid ? "text-success" : "text-warning"}`}>{valid ? "on target" : "off target"}</span>
              </div>

              {v.dayTypes.map((dt) => {
                const dtVal = validation.dayTypes?.find((d) => d.dayType === dt.name);
                return (
                  <div key={dt.name} className="mb-4">
                    <div className="mb-1 flex items-baseline justify-between">
                      <p className="font-medium capitalize">{dt.name}</p>
                      {dtVal ? (
                        <p className="text-sm text-muted-foreground">
                          <span className="metric">{dtVal.actual.kcal}</span>/{dtVal.target.kcal} kcal · {dtVal.actual.protein_g}/{dtVal.target.protein_g}g P
                        </p>
                      ) : null}
                    </div>
                    {dt.meals.map((m) => (
                      <div key={m.slot} className="mb-2 rounded-md bg-surface-raised p-2">
                        <p className="metric-label capitalize">{m.slot}</p>
                        <ul className="space-y-1">
                          {m.items.map((it) => {
                            const food = foodById.get(it.food_id) as FoodMacroRow | undefined;
                            const macros = food ? macrosForGrams(food, it.grams) : null;
                            return (
                              <li key={it.food_id} className="flex items-center justify-between gap-2 text-sm">
                                <span className="flex-1 truncate">{nameOf(it.food_id)}</span>
                                <form action={editPlanItemAction} className="flex items-center gap-1">
                                  <input type="hidden" name="planId" value={plan.id} />
                                  <input type="hidden" name="kind" value="resize" />
                                  <input type="hidden" name="versionLabel" value={v.label} />
                                  <input type="hidden" name="dayType" value={dt.name} />
                                  <input type="hidden" name="slot" value={m.slot} />
                                  <input type="hidden" name="foodId" value={it.food_id} />
                                  <input
                                    type="number"
                                    name="grams"
                                    defaultValue={it.grams}
                                    min={1}
                                    max={1000}
                                    aria-label={`${nameOf(it.food_id)} grams`}
                                    className="w-16 rounded-[6px] border border-border bg-background px-1 py-0.5 text-right"
                                  />
                                  <span className="text-muted-foreground">g</span>
                                  <button type="submit" className="rounded-[6px] border border-border px-1.5 py-0.5 text-xs hover:bg-surface-raised">
                                    save
                                  </button>
                                </form>
                                <span className="w-16 text-right text-muted-foreground">{macros ? `${macros.kcal} kcal` : "—"}</span>
                                <form action={editPlanItemAction}>
                                  <input type="hidden" name="planId" value={plan.id} />
                                  <input type="hidden" name="kind" value="remove" />
                                  <input type="hidden" name="versionLabel" value={v.label} />
                                  <input type="hidden" name="dayType" value={dt.name} />
                                  <input type="hidden" name="slot" value={m.slot} />
                                  <input type="hidden" name="foodId" value={it.food_id} />
                                  <button type="submit" aria-label={`Remove ${nameOf(it.food_id)}`} className="rounded-[6px] border border-border px-1.5 py-0.5 text-xs text-danger hover:bg-danger/10">
                                    ✕
                                  </button>
                                </form>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                );
              })}

              {plan.status === "draft" ? (
                <form action={approvePlanAction}>
                  <input type="hidden" name="planId" value={plan.id} />
                  <input type="hidden" name="versionLabel" value={v.label} />
                  <button type="submit" disabled={!valid} className="w-full rounded-[6px] bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-40">
                    Approve version {v.label}
                  </button>
                </form>
              ) : null}
            </section>
          );
        })}
      </div>

      {plan.status === "draft" ? (
        <form action={rejectPlanAction} className="rounded-[10px] border border-border bg-surface p-4">
          <label className="metric-label" htmlFor="reject-note">
            Reject &amp; regenerate with a note
          </label>
          <textarea id="reject-note" name="note" rows={2} className="mt-1 w-full rounded-[6px] border border-border bg-background p-2 text-sm" placeholder="e.g. more Indian breakfasts, swap oats for poha" />
          <input type="hidden" name="planId" value={plan.id} />
          <button type="submit" className="mt-2 rounded-[6px] border border-border px-3 py-1.5 text-sm hover:bg-surface-raised">
            Reject &amp; regenerate
          </button>
        </form>
      ) : null}
    </div>
  );
}
