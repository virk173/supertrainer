import type { SupabaseClient } from "@supabase/supabase-js";

import {
  routeMessage,
  type NumberWrapper,
  type ReplyDrafter,
  type RouteClassifier,
  type RouteResult,
} from "@supertrainer/ai";
import type { Json } from "@supertrainer/db/types";

import { autonomousReply } from "@/lib/comms/answer";
import { assembleClientContext } from "@/lib/comms/context";
import { enqueueDraft } from "@/lib/comms/draft";
import { handleClientMessage } from "@/lib/comms/escalate";

// Phase 6.4 — the lane dispatcher. Routes a client message ONCE (fail-closed
// two-gate), then sends it down exactly one lane:
//   escalation        → holding line + crisis card + urgent queue (6.3)
//   routine_autonomous → an assistant-labeled answer with CODE-computed numbers
//   conversational | plan_impact → a drafted reply in the trainer's queue
// db-injected + injectable agents so CI drives the real control flow with no model.

export interface DispatchInput {
  orgId: string;
  clientId: string;
  messageId: string;
  text: string;
  coachName?: string;
}

export interface DispatchDeps {
  classify?: RouteClassifier;
  wrap?: NumberWrapper;
  draft?: ReplyDrafter;
  now?: Date;
}

export type DispatchLane = "escalation" | "autonomous" | "draft";

export interface DispatchResult {
  lane: DispatchLane;
  route: RouteResult;
  escalationId?: string;
  reply?: string;
  draftId?: string;
}

export async function dispatchClientMessage(
  db: SupabaseClient,
  input: DispatchInput,
  deps: DispatchDeps = {},
): Promise<DispatchResult> {
  const route = await routeMessage(input.text, { classify: deps.classify });

  // ── escalation ──────────────────────────────────────────────────────────────
  if (route.escalation) {
    const r = await handleClientMessage(db, input, { route });
    return { lane: "escalation", route, escalationId: r.escalationId };
  }

  // Everything else needs the coded context (assembled once).
  const ctx = await assembleClientContext(db, input.clientId, deps.now ?? new Date());

  // ── routine_autonomous → instant assistant answer (coded numbers) ────────────
  if (route.category === "routine_autonomous") {
    const ans = await autonomousReply(ctx, input.text, { wrap: deps.wrap });
    if (ans) {
      await db.from("messages").insert({
        org_id: input.orgId,
        client_id: input.clientId,
        sender: "assistant",
        kind: "text",
        body: ans.reply,
        payload: { autonomous: true, fact_kind: ans.fact.kind } as unknown as Json,
      });
      return { lane: "autonomous", route, reply: ans.reply };
    }
    // No coded fact matched — don't guess; drop through to a drafted reply.
  }

  // ── conversational | plan_impact | (routine with no coded fact) → draft ──────
  const category = route.category === "plan_impact" ? "plan_impact" : "conversational";
  const { draftId } = await enqueueDraft(
    db,
    { orgId: input.orgId, clientId: input.clientId, messageId: input.messageId, text: input.text, category },
    { draft: deps.draft, ctx, now: deps.now },
  );
  return { lane: "draft", route, draftId };
}
