import type {
  Effect,
  SubState,
  Transition,
  WebhookEvent,
  WebhookEventType,
} from "./webhook-types";

// Phase 8.3 — the money-correctness core: a PURE reducer over Stripe webhook
// events. Given the current local subscription state + a normalized event, it
// returns the next state and the side effects to run transactionally with the
// state write. No I/O, no Stripe SDK, no clock — exhaustively testable.
//
// Two safety properties are enforced HERE, not left to the caller:
//  • Out-of-order delivery: a subscription-scoped event older than the last one
//    applied (by Stripe `created`) is skipped, never rolled back over newer state.
//  • Idempotency shape: the reducer is a function of (state, event) only — the
//    route dedupes exact replays by stripe_event_id before we ever run, and a
//    re-applied checkout on an already-active sub never re-welcomes.

const SUBSCRIPTION_SCOPED = new Set<WebhookEventType>([
  "checkout.session.completed",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);

const MAX_DUNNING_STAGE = 3;

/** Build the upsert_subscription effect that persists a state to the row. */
function upsert(state: SubState, event: WebhookEvent): Effect {
  return {
    kind: "upsert_subscription",
    status: state.status,
    pauseReason: state.pauseReason,
    dunningStage: state.dunningStage,
    cancelAtPeriodEnd: state.cancelAtPeriodEnd,
    currentPeriodEnd: event.currentPeriodEnd ?? null,
    stripeSubscriptionId: event.stripeSubscriptionId,
    stripeCustomerId: event.stripeCustomerId,
    tierId: event.tierId,
  };
}

export function transition(state: SubState, event: WebhookEvent): Transition {
  // ── global (non-subscription) events: effects only, no state mutation ──────
  if (!SUBSCRIPTION_SCOPED.has(event.type)) {
    switch (event.type) {
      case "account.updated":
        return {
          newState: state,
          effects: [
            {
              kind: "set_connect_status",
              chargesEnabled: event.chargesEnabled ?? false,
              payoutsEnabled: event.payoutsEnabled ?? false,
            },
            { kind: "audit", action: "webhook.account_updated" },
          ],
        };
      case "account.application.deauthorized":
        return {
          newState: state,
          effects: [
            { kind: "flag_trainer", flag: "connect_deauthorized" },
            { kind: "flag_platform_admin", reason: "connect_deauthorized" },
            { kind: "audit", action: "webhook.connect_deauthorized" },
          ],
        };
      case "charge.dispute.created":
        return {
          newState: state,
          effects: [
            { kind: "flag_trainer", flag: "dispute" },
            { kind: "flag_platform_admin", reason: "dispute" },
            { kind: "audit", action: "webhook.dispute_created" },
          ],
        };
      default:
        return { newState: state, effects: [{ kind: "audit", action: "webhook.ignored" }] };
    }
  }

  // ── out-of-order guard (subscription-scoped only) ──────────────────────────
  if (state.lastEventAt !== null && event.created < state.lastEventAt) {
    return { newState: state, effects: [{ kind: "audit", action: "webhook.stale_skipped" }] };
  }

  const next: SubState = { ...state, lastEventAt: event.created };

  switch (event.type) {
    case "checkout.session.completed": {
      const wasNew = !state.exists;
      next.exists = true;
      next.status = "active";
      next.pauseReason = "none";
      next.dunningStage = 0;
      const effects: Effect[] = [
        upsert(next, event),
        { kind: "set_client_status", status: "active" },
      ];
      if (wasNew) effects.push({ kind: "notify_client", template: "welcome" });
      effects.push({ kind: "audit", action: "webhook.checkout_completed" });
      return { newState: next, effects };
    }

    case "invoice.paid": {
      const wasDunning =
        state.status === "past_due" ||
        state.status === "unpaid" ||
        state.pauseReason === "dunning" ||
        state.dunningStage > 0;
      next.status = "active";
      next.pauseReason = "none";
      next.dunningStage = 0;
      const effects: Effect[] = [
        upsert(next, event),
        {
          kind: "record_payment",
          invoiceId: event.invoiceId,
          amountCents: event.amountCents ?? 0,
          applicationFeeCents: event.applicationFeeCents ?? 0,
          currency: event.currency ?? "usd",
          status: "paid",
          periodStart: event.periodStart ?? null,
          periodEnd: event.periodEnd ?? null,
        },
      ];
      if (wasDunning) {
        // Recovery: reactivate access, welcome them back, and — the fairness
        // rule — mark the payment gap as not-expected so it's never a "missed" day.
        effects.push({ kind: "set_client_status", status: "active" });
        effects.push({ kind: "notify_client", template: "payment_recovered" });
        effects.push({ kind: "ledger_mark_gap_not_expected" });
      }
      effects.push({ kind: "audit", action: "webhook.invoice_paid" });
      return { newState: next, effects };
    }

    case "invoice.payment_failed": {
      next.status = "past_due";
      next.pauseReason = "dunning";
      // Prefer Stripe's own retry counter (attempt_count) so the stage is a
      // function of the invoice's real attempt number, not of how many events
      // we've counted — a paired customer.subscription.updated can't double-advance
      // it. Fall back to an increment when the count is absent (fixtures).
      next.dunningStage = Math.min(
        MAX_DUNNING_STAGE,
        event.attemptCount ?? state.dunningStage + 1,
      );
      const effects: Effect[] = [
        upsert(next, event),
        {
          kind: "record_payment",
          invoiceId: event.invoiceId,
          amountCents: event.amountCents ?? 0,
          applicationFeeCents: 0,
          currency: event.currency ?? "usd",
          status: "failed",
          periodStart: event.periodStart ?? null,
          periodEnd: event.periodEnd ?? null,
        },
      ];
      // The dunning ladder rides Stripe Smart Retries (each retry → one failed
      // invoice → one stage). All comms are system-voiced — the trainer never
      // personally chases money (§9). At the final stage the plan is paused
      // (portal restricted); the trainer only gets a flag with an extend-grace
      // override. Access restriction here = client status 'paused', which also
      // switches P3 expectations off (gap-fairness).
      if (next.dunningStage >= MAX_DUNNING_STAGE) {
        effects.push({ kind: "set_client_status", status: "paused" });
        effects.push({ kind: "notify_client", template: "plan_paused" });
        effects.push({ kind: "flag_trainer", flag: "payment_failed" });
        effects.push({ kind: "audit", action: "webhook.dunning_paused" });
      } else {
        effects.push({ kind: "notify_client", template: "payment_failed" });
        effects.push({ kind: "flag_trainer", flag: "payment_failed" });
        effects.push({ kind: "audit", action: "webhook.payment_failed" });
      }
      return { newState: next, effects };
    }

    case "customer.subscription.updated": {
      const wasDunning =
        state.status === "past_due" ||
        state.status === "unpaid" ||
        state.pauseReason === "dunning" ||
        state.dunningStage > 0;
      if (event.subscriptionStatus) next.status = event.subscriptionStatus;
      if (event.cancelAtPeriodEnd !== undefined) next.cancelAtPeriodEnd = event.cancelAtPeriodEnd;
      if (next.status === "past_due" || next.status === "unpaid") {
        next.pauseReason = "dunning";
        // Only floor to stage 1 — never advance here. invoice.payment_failed
        // (attempt_count) is the sole stage-advancer, so a paired updated event
        // can't push the ladder forward regardless of delivery order.
        next.dunningStage = Math.max(1, state.dunningStage);
      } else if (next.status === "active") {
        next.pauseReason = "none";
        next.dunningStage = 0;
      } else if (next.status === "paused") {
        next.pauseReason = "vacation";
      }
      const effects: Effect[] = [upsert(next, event)];
      if (next.status === "active" && state.status !== "active") {
        effects.push({ kind: "set_client_status", status: "active" });
        // Recovery can arrive via updated OR invoice.paid, in either order. Fire
        // the recovery effects on whichever wins the transition out of dunning;
        // the loser sees already-clean state and won't re-fire (notify dedupes).
        if (wasDunning) {
          effects.push({ kind: "notify_client", template: "payment_recovered" });
          effects.push({ kind: "ledger_mark_gap_not_expected" });
        }
      }
      effects.push({ kind: "audit", action: "webhook.subscription_updated" });
      return { newState: next, effects };
    }

    case "customer.subscription.deleted": {
      next.status = "canceled";
      next.pauseReason = "none";
      next.dunningStage = 0;
      next.cancelAtPeriodEnd = false;
      return {
        newState: next,
        effects: [
          upsert(next, event),
          { kind: "set_client_status", status: "churned" },
          { kind: "notify_client", template: "subscription_canceled" },
          { kind: "audit", action: "webhook.subscription_deleted" },
        ],
      };
    }

    case "customer.subscription.paused": {
      next.status = "paused";
      next.pauseReason = "vacation";
      return {
        newState: next,
        effects: [
          upsert(next, event),
          { kind: "set_client_status", status: "paused" },
          { kind: "audit", action: "webhook.subscription_paused" },
        ],
      };
    }

    case "customer.subscription.resumed": {
      next.status = "active";
      next.pauseReason = "none";
      next.dunningStage = 0;
      return {
        newState: next,
        effects: [
          upsert(next, event),
          { kind: "set_client_status", status: "active" },
          { kind: "audit", action: "webhook.subscription_resumed" },
        ],
      };
    }

    default:
      return { newState: state, effects: [{ kind: "audit", action: "webhook.ignored" }] };
  }
}
