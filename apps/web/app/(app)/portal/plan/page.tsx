import { UtensilsCrossed } from "lucide-react";

import { macrosForGrams } from "@supertrainer/nutrition-engine";
import { EmptyState } from "@supertrainer/ui/components/empty-state";

import { fastingState, type FastWindow } from "@/lib/plans/fasting";
import { buildGroceryList, type GroceryFoodMeta } from "@/lib/plans/grocery";
import type { PlanContent } from "@/lib/plans/edit";
import { getCurrentClientContext } from "@/lib/ledger/log";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "My plan — supertrainer" };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Client-local weekday index (0=Sun) + minutes-since-midnight, from the timezone.
function localNow(timezone: string): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const wk = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return { weekday: Math.max(0, WEEKDAYS.indexOf(wk)), minutes: hour * 60 + minute };
}

export default async function PortalPlanPage() {
  const ctx = await getCurrentClientContext();
  if (!ctx) {
    return <EmptyState icon={<UtensilsCrossed />} title="No plan yet" description="Your coach hasn't shared a plan with you yet." />;
  }
  const service = createServiceClient();

  const [{ data: active }, { data: plan }] = await Promise.all([
    service.from("plans_active").select("day_types, schedule, targets, meal_slots, fast_window").eq("client_id", ctx.clientId).maybeSingle(),
    service.from("plans").select("id, content").eq("client_id", ctx.clientId).eq("status", "approved").order("approved_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (!active || !plan) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">My plan</h1>
        <EmptyState icon={<UtensilsCrossed />} title="No active plan" description="Your coach is preparing your plan — you'll see it here once it's ready." />
      </div>
    );
  }

  const content = plan.content as PlanContent & { approvedVersion?: string };
  const version = content.versions.find((v) => v.label === content.approvedVersion) ?? content.versions[0];
  const schedule = (active.schedule as Record<string, string>) ?? {};
  const targets = (active.targets as Record<string, { kcal: number; protein_g: number; carbs_g: number; fat_g: number }>) ?? {};

  const { weekday, minutes } = localNow(ctx.timezone);
  const todayType = schedule[String(weekday)] ?? version.dayTypes[0]?.name;
  const todayDay = version.dayTypes.find((d) => d.name === todayType) ?? version.dayTypes[0];
  const todayTarget = targets[todayType ?? ""];

  // Food names/meta for this plan.
  const ids = [...new Set(version.dayTypes.flatMap((d) => d.meals.flatMap((m) => m.items.map((i) => i.food_id))))];
  const { data: foods } = ids.length
    ? await service.from("foods").select("id, name, allergen_tags, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g").in("id", ids)
    : { data: [] };
  const foodById = new Map((foods ?? []).map((f) => [f.id, f]));
  const foodMeta = new Map<string, GroceryFoodMeta>((foods ?? []).map((f) => [f.id, { name: f.name, allergen_tags: f.allergen_tags }]));

  const grocery = buildGroceryList({ dayTypes: version.dayTypes, schedule, foodMeta });
  const fast = active.fast_window ? fastingState(active.fast_window as unknown as FastWindow, minutes) : null;

  return (
    <div className="space-y-6" data-testid="portal-plan">
      <header>
        <p className="metric-label">Today · {WEEKDAYS[weekday]}{todayType ? ` · ${todayType}` : ""}</p>
        <h1 className="text-2xl font-semibold tracking-tight">My plan</h1>
        {todayTarget ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Target <span className="metric">{todayTarget.kcal}</span> kcal · {todayTarget.protein_g}g protein · {todayTarget.carbs_g}g carbs · {todayTarget.fat_g}g fat
          </p>
        ) : null}
      </header>

      {fast ? (
        <section className="rounded-[10px] border border-border bg-surface p-4" data-testid="fasting-widget">
          <p className="metric-label">Fasting window</p>
          <p className="text-sm">
            {fast.state === "eating" ? "Eating window open" : "Fasting"} ·{" "}
            <span className="metric">{Math.floor(fast.minutesUntilChange / 60)}h {fast.minutesUntilChange % 60}m</span>{" "}
            until {fast.state === "eating" ? "close" : "open"}
          </p>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Today&apos;s meals</h2>
        {(todayDay?.meals ?? []).map((m) => (
          <div key={m.slot} className="rounded-[10px] border border-border bg-surface p-3">
            <p className="metric-label capitalize">{m.slot}</p>
            <ul className="mt-1 space-y-1">
              {m.items.map((it) => {
                const f = foodById.get(it.food_id);
                const macros = f ? macrosForGrams(f, it.grams) : null;
                return (
                  <li key={it.food_id} className="flex items-center justify-between text-sm">
                    <span>{f?.name ?? it.food_id} · {it.grams}g</span>
                    <span className="text-muted-foreground">{macros ? `${macros.kcal} kcal` : ""}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">This week</h2>
        <div className="flex flex-wrap gap-2 text-sm">
          {WEEKDAYS.map((w, d) => (
            <span key={w} className={`rounded-md px-2 py-1 ${d === weekday ? "bg-foreground text-background" : "bg-surface-raised text-muted-foreground"}`}>
              {w}: {schedule[String(d)] ?? todayType}
            </span>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Grocery list</h2>
          <a href={`/portal/plan/pdf`} className="text-sm underline">Download PDF</a>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {grocery.map((g) => (
            <div key={g.category} className="rounded-[10px] border border-border bg-surface p-3">
              <p className="metric-label capitalize">{g.category}</p>
              <ul className="mt-1 space-y-1 text-sm">
                {g.items.map((it) => (
                  <li key={it.foodId} className="flex justify-between">
                    <span>{it.name}</span>
                    <span className="text-muted-foreground">{it.display}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
