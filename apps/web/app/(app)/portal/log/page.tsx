import { redirect } from "next/navigation";

import { MealLogger, type MealSlot } from "@/components/meal-logger";
import { getCurrentClientContext } from "@/lib/ledger/log";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Log a meal — supertrainer" };

// Best-guess the slot from the client's local time so the common case is 0 taps
// on the selector.
function defaultSlot(timezone: string): MealSlot {
  let hour = 12;
  try {
    hour = Number(
      new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hour12: false }).format(new Date()),
    );
  } catch {
    /* fall back to midday */
  }
  if (hour < 11) return "breakfast";
  if (hour < 16) return "lunch";
  if (hour < 21) return "dinner";
  return "snack";
}

export default async function LogMealPage() {
  const ctx = await getCurrentClientContext();
  if (!ctx) redirect("/portal");

  // With an approved plan (P4.3) the confirm card compares against today's
  // targets; without one, the client logs in generic mode (numbers only).
  const service = createServiceClient();
  const { data: plan } = await service
    .from("plans_active")
    .select("meal_slots")
    .eq("client_id", ctx.clientId)
    .maybeSingle();

  return (
    <MealLogger defaultSlot={defaultSlot(ctx.timezone)} hasActivePlan={Boolean(plan)} />
  );
}
