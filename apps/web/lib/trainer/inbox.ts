import type { ScoreBand } from "@supertrainer/scoring";

import { fastingState, type FastStatus, type FastWindow } from "@/lib/plans/fasting";
import { computeClientLens, type LedgerDayRow } from "@/lib/ledger/score";
import { createServiceClient } from "@/lib/supabase/server";

const DAY_MS = 86_400_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface InboxDraft {
  id: string;
  text: string;
  triggerText: string | null;
}

export interface InboxContext {
  adherence: number | null;
  band: ScoreBand | null;
  streak: number;
  sparkline: (number | null)[]; // 4 weekly scores, oldest → newest
  weightKg: number | null;
  weightDeltaKg: number | null; // vs ~4 weeks ago
  todayLabel: string; // "Mon · training"
  fast: FastStatus | null;
  hasPlan: boolean;
  hasSplit: boolean;
}

export interface InboxTodos {
  pendingDrafts: number;
  renewalDays: number | null; // days until the 28-day cycle completes (may be negative → overdue)
  lastLogDays: number | null; // days since the last logged day
  onboardingStalled: boolean;
  consentPending: boolean;
  paymentFailed: boolean; // live (P8.5): the client's subscription is in dunning
}

export interface ClientInbox {
  clientId: string;
  clientName: string;
  status: string;
  context: InboxContext;
  todos: InboxTodos;
  draft: InboxDraft | null;
}

function resolveName(row: {
  intake?: unknown;
  profiles?: { display_name?: string | null } | null;
}): string {
  const display = row.profiles?.display_name;
  if (display) return display;
  const intake = row.intake;
  const name =
    intake && typeof intake === "object" ? (intake as { name?: unknown }).name : undefined;
  return typeof name === "string" ? name : "Client";
}

function localNow(timezone: string, now: Date): { weekday: number; minutes: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const wk = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    return { weekday: Math.max(0, WEEKDAYS.indexOf(wk)), minutes: hour * 60 + minute };
  } catch {
    return { weekday: now.getUTCDay(), minutes: now.getUTCHours() * 60 + now.getUTCMinutes() };
  }
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Everything the per-client inbox's right rail needs: forensic context + the
// to-do tracker + the pending drafted reply. Org ownership is checked by the
// caller; every read here is scoped to the one client.
export async function getClientInbox(
  clientId: string,
  now: Date,
): Promise<ClientInbox | null> {
  const service = createServiceClient();
  const { data: client } = await service
    .from("clients")
    .select("id, org_id, status, intake, consent_signed_at, created_at, profiles:profile_id (display_name)")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) return null;

  const timezone =
    (client.intake as { timezone?: unknown } | null)?.timezone;
  const tz = typeof timezone === "string" ? timezone : "UTC";
  const windowStart = dateStr(new Date(now.getTime() - 28 * DAY_MS));

  const [ledgerRes, weighRes, activeRes, splitRes, draftRes, subRes] =
    await Promise.all([
      service
        .from("ledger_days")
        .select("tz_date, expected, misses")
        .eq("client_id", clientId)
        .gte("tz_date", windowStart)
        .order("tz_date", { ascending: true }),
      service
        .from("weigh_ins")
        .select("tz_date, weight_kg")
        .eq("client_id", clientId)
        .order("tz_date", { ascending: false })
        .limit(40),
      service
        .from("plans_active")
        .select("schedule, day_types, fast_window, effective_from")
        .eq("client_id", clientId)
        .maybeSingle(),
      service
        .from("splits")
        .select("id")
        .eq("client_id", clientId)
        .eq("status", "approved")
        .limit(1),
      service
        .from("drafts")
        .select("id, draft_text, status, created_at, messages:message_id (body)")
        .eq("client_id", clientId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1),
      // Phase 8.5 — the failed-payment flag is now live (P8 stub → real).
      service
        .from("subscriptions")
        .select("status, pause_reason")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const ledger = (ledgerRes.data ?? []) as unknown as LedgerDayRow[];
  const lens = ledger.length ? computeClientLens(ledger) : null;

  // 4 weekly adherence scores, oldest → newest.
  const sparkline: (number | null)[] = [];
  for (let w = 3; w >= 0; w--) {
    const hi = dateStr(new Date(now.getTime() - w * 7 * DAY_MS));
    const lo = dateStr(new Date(now.getTime() - (w + 1) * 7 * DAY_MS));
    const rows = ledger.filter((r) => r.tz_date >= lo && r.tz_date < hi);
    sparkline.push(rows.length ? computeClientLens(rows).score : null);
  }

  const weighs = weighRes.data ?? [];
  const weightKg = weighs.length ? Number(weighs[0]!.weight_kg) : null;
  const earliest = weighs.length ? Number(weighs[weighs.length - 1]!.weight_kg) : null;
  const weightDeltaKg =
    weightKg !== null && earliest !== null && weighs.length > 1
      ? Math.round((weightKg - earliest) * 10) / 10
      : null;

  const active = activeRes.data;
  const { weekday, minutes } = localNow(tz, now);
  const schedule = (active?.schedule as Record<string, string> | undefined) ?? {};
  const dayTypes = (active?.day_types as { name?: string }[] | undefined) ?? [];
  const dayType = schedule[String(weekday)] ?? dayTypes[0]?.name;
  const todayLabel = `${WEEKDAYS[weekday]}${dayType ? ` · ${dayType}` : ""}`;
  const fast = active?.fast_window
    ? fastingState(active.fast_window as unknown as FastWindow, minutes)
    : null;

  const lastLogDays =
    ledger.length > 0
      ? Math.round(
          (Date.parse(`${dateStr(now)}T00:00:00Z`) -
            Date.parse(`${ledger[ledger.length - 1]!.tz_date}T00:00:00Z`)) /
            DAY_MS,
        )
      : null;

  // Renewal counts from when the plan went live (plans_active.effective_from),
  // matching the renewal cron — not the draft creation date.
  const liveSince = active?.effective_from as string | null | undefined;
  const renewalDays = liveSince
    ? 28 - Math.round((now.getTime() - Date.parse(liveSince)) / DAY_MS)
    : null;

  const draftRow = draftRes.data?.[0];
  const draft: InboxDraft | null = draftRow
    ? {
        id: draftRow.id as string,
        text: draftRow.draft_text as string,
        triggerText: (draftRow.messages as { body?: string | null } | null)?.body ?? null,
      }
    : null;

  const status = client.status as string;
  return {
    clientId,
    clientName: resolveName(client),
    status,
    context: {
      adherence: lens?.score ?? null,
      band: lens?.band.band ?? null,
      streak: lens?.streak ?? 0,
      sparkline,
      weightKg,
      weightDeltaKg,
      todayLabel,
      fast,
      hasPlan: active != null,
      hasSplit: (splitRes.data?.length ?? 0) > 0,
    },
    todos: {
      pendingDrafts: draft ? 1 : 0,
      renewalDays,
      lastLogDays,
      onboardingStalled:
        status === "onboarding" && Date.parse(client.created_at as string) < now.getTime() - 3 * DAY_MS,
      consentPending: status === "active" && !client.consent_signed_at,
      paymentFailed:
        subRes.data != null &&
        (subRes.data.status === "past_due" ||
          subRes.data.status === "unpaid" ||
          subRes.data.pause_reason === "dunning"),
    },
    draft,
  };
}
