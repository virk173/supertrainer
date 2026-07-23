import "server-only";

import { z } from "zod";

import type { Json } from "@supertrainer/db/types";

import { trackServer } from "@/lib/analytics/server";
import { computeConfirmedItems } from "@/lib/ledger/resolve";
import { tzDate } from "@/lib/ledger/tz";
import { getSessionClaims } from "@/lib/onboarding/state";
import { type ComputedMacros } from "@/lib/preview/macros";
import { createServiceClient } from "@/lib/supabase/server";

// Phase 3.2 — the authoritative meal-log write path. Runs server-side with the
// service role but derives the client from the authenticated session, so a
// caller can only ever log for THEIR OWN client (tenancy verified in code — the
// service role bypasses RLS). Every stored number is recomputed here from the
// foods table; the client's posted macros are ignored entirely (CLAUDE.md
// rule 4 + never trust the client).

export const LogItemSchema = z.object({
  // A verified DB food, or null for an unverified freeform item.
  foodId: z.string().uuid().nullable(),
  name: z.string().min(1).max(120),
  qty: z.number().positive().max(1000),
  unit: z.string().max(24).nullable(),
  grams: z.number().positive().max(5000),
});

export const LogMealSchema = z.object({
  mealSlot: z.enum(["breakfast", "lunch", "dinner", "snack", "other"]),
  method: z.enum(["text", "photo", "voice"]),
  rawInput: z.string().max(2000).nullable(),
  photoPath: z.string().max(300).nullable().optional(),
  items: z.array(LogItemSchema).min(1).max(30),
});

export type LogMealInput = z.infer<typeof LogMealSchema>;

export interface ClientContext {
  clientId: string;
  orgId: string;
  timezone: string;
  locale: string | null;
}

// The authenticated portal user's client row + their timezone (for tz_date).
export async function getCurrentClientContext(): Promise<ClientContext | null> {
  const { orgId, userId } = await getSessionClaims();
  if (!orgId || !userId) return null;
  const service = createServiceClient();
  const { data: client } = await service
    .from("clients")
    .select("id, org_id, profiles:profile_id (timezone, locale)")
    .eq("profile_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!client) return null;
  const profile = (client.profiles ?? null) as { timezone?: string; locale?: string | null } | null;
  return {
    clientId: client.id,
    orgId: client.org_id,
    timezone: profile?.timezone ?? "UTC",
    locale: profile?.locale ?? null,
  };
}

// tzDate (client-local calendar date, the ledger's day bucket) is re-exported
// from ./tz for existing importers; the single guarded impl lives there.
export { tzDate };

export interface LogMealResult {
  id: string;
  tzDate: string;
  totals: ComputedMacros;
  hasUnverified: boolean;
}

// Persist a confirmed meal log: recompute macros, insert the log, mirror a
// system confirmation into the thread, and fire the funnel event.
export async function logMeal(input: LogMealInput): Promise<LogMealResult> {
  const parsed = LogMealSchema.parse(input);
  const ctx = await getCurrentClientContext();
  if (!ctx) throw new Error("No client for the current session");

  const service = createServiceClient();
  const { items, totals } = await computeConfirmedItems(service, ctx.orgId, parsed.items);
  const day = tzDate(ctx.timezone);
  const hasUnverified = items.some((i) => !i.verified);

  const { data: log, error } = await service
    .from("meal_logs")
    .insert({
      org_id: ctx.orgId,
      client_id: ctx.clientId,
      tz_date: day,
      meal_slot: parsed.mealSlot,
      items: items as unknown as Json,
      totals: totals as unknown as Json,
      method: parsed.method,
      photo_path: parsed.photoPath ?? null,
      confirmed: true,
      raw_input: parsed.rawInput,
    })
    .select("id")
    .single();
  if (error) throw error;

  // Mirror a confirmation into the client's thread (messages exists from P2.5;
  // P6.1 adds realtime fanout). sender=system, kind=log_confirmation.
  const names = items.map((i) => `${i.qty} ${i.unit ?? ""} ${i.name}`.replace(/\s+/g, " ").trim());
  const body = `Logged ${parsed.mealSlot}: ${names.join(", ")}${
    totals.kcal > 0 ? ` (≈ ${totals.kcal} kcal)` : ""
  }`;
  await service.from("messages").insert({
    org_id: ctx.orgId,
    client_id: ctx.clientId,
    sender: "system",
    kind: "log_confirmation",
    body,
    payload: { meal_log_id: log.id, meal_slot: parsed.mealSlot, totals } as unknown as Json,
  });

  await trackServer({
    orgId: ctx.orgId,
    clientId: ctx.clientId,
    event: "meal_logged",
    properties: {
      method: parsed.method,
      meal_slot: parsed.mealSlot,
      item_count: items.length,
      kcal: totals.kcal,
      has_unverified: hasUnverified,
    },
  });

  return { id: log.id, tzDate: day, totals, hasUnverified };
}
