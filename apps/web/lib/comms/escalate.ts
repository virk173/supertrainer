import type { SupabaseClient } from "@supabase/supabase-js";

import { routeMessage, type RouteClassifier, type RouteResult } from "@supertrainer/ai";
import type { Json } from "@supertrainer/db/types";

// Phase 6.3 — escalation handling. Given a client message, route it (fail-closed
// two-gate) and, when it escalates, record the urgent queue item (P7 surfaces it),
// send the client a clearly-automated holding line, and — on a self-harm signal —
// a supportive, non-clinical crisis-resources card. db-injected + injectable
// classifier so CI drives the real control flow with zero model calls (the keyword
// floor still fires deterministically).

function holdingLine(coach: string): string {
  // A SYSTEM message — clearly automated, no AI pretending to care.
  return `Thanks for telling ${coach} — I've flagged this so they can reply to you personally. Hang tight; you'll hear from them directly.`;
}

// Supportive, non-clinical, region-neutral. NOTE: the exact crisis-resource
// wording/links should get a careful human review before production (mirrors the
// consent-v1 lawyer TODO) — deliberately no specific hotline number, since this
// is a multi-region app and a wrong number is worse than none.
const CRISIS_CARD =
  "It sounds like you're going through something really heavy, and I'm glad you said something — you don't have to carry it alone. Your coach has been notified and will reach out. If you need to talk to someone right now, please reach a trained counsellor through a local crisis or helpline service in your area. You matter.";

export interface EscalateInput {
  orgId: string;
  clientId: string;
  messageId: string;
  text: string;
  coachName?: string;
}

export interface EscalateResult {
  escalated: boolean;
  route: RouteResult;
  escalationId?: string;
}

export interface EscalateDeps {
  classify?: RouteClassifier;
  /** Pre-computed route (skips classification) — used when the caller already routed. */
  route?: RouteResult;
}

export async function handleClientMessage(
  db: SupabaseClient,
  input: EscalateInput,
  deps: EscalateDeps = {},
): Promise<EscalateResult> {
  const route = deps.route ?? (await routeMessage(input.text, { classify: deps.classify }));
  if (!route.escalation) return { escalated: false, route };

  // Resolve the coach name only on the (rare) escalation path.
  let coach = input.coachName?.trim() ?? "";
  if (!coach) {
    const { data: org } = await db.from("orgs").select("name").eq("id", input.orgId).maybeSingle();
    coach = org?.name?.trim() || "your coach";
  }

  // 1) The urgent queue item (the trainer handles it personally).
  const { data: esc } = await db
    .from("escalations")
    .insert({
      org_id: input.orgId,
      client_id: input.clientId,
      message_id: input.messageId,
      categories: route.escalationCategories,
      self_harm: route.selfHarm,
      plan_change: route.planChange,
      source: route.source,
      excerpt: input.text.slice(0, 300),
    })
    .select("id")
    .single();

  // 2) The client's holding line — a SYSTEM message, clearly automated.
  await db.from("messages").insert({
    org_id: input.orgId,
    client_id: input.clientId,
    sender: "system",
    kind: "text",
    body: holdingLine(coach),
    payload: { escalation: true } as unknown as Json,
  });

  // 3) Self-harm → a supportive crisis-resources card, in addition to the alert.
  if (route.selfHarm) {
    await db.from("messages").insert({
      org_id: input.orgId,
      client_id: input.clientId,
      sender: "system",
      kind: "card",
      body: CRISIS_CARD,
      payload: { crisis: true } as unknown as Json,
    });
  }

  // 4) The trainer signal (events row — P7's queue feed / morning digest). Written
  // directly (not via server-only trackServer) so this stays db-injected/testable.
  // Real trainer PUSH delivery waits on trainer-side push infra (documented defer).
  await db.from("events").insert({
    org_id: input.orgId,
    client_id: input.clientId,
    type: "escalation_raised",
    payload: {
      categories: route.escalationCategories,
      self_harm: route.selfHarm,
      plan_change: route.planChange,
      source: route.source,
    } as unknown as Json,
  });

  return { escalated: true, route, escalationId: esc?.id ?? undefined };
}
