import "server-only";

import { recordAudit } from "@supertrainer/db/queries";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@supertrainer/db/types";

import type { Effect, WebhookEvent } from "./webhook-types";

type Service = SupabaseClient<Database>;

// Phase 8.3 — the effect executor. Runs the effects the pure machine described,
// with the service role and org_id verified in code (tenancy rule). Every effect
// is IDEMPOTENT (upsert by natural key, insert-or-skip on unique constraints), so
// a Stripe redelivery after a mid-processing failure re-runs safely — the route
// only stamps webhook_events.processed_at once all effects succeed.
//
// A DB error is THROWN, never swallowed: the route then leaves processed_at null,
// returns 5xx, and Stripe redelivers → the idempotent effects re-run. Money code
// must fail loud, not mark a failed write as done.
function ok<T extends { error: unknown }>(res: T): T {
  if (res.error) throw res.error;
  return res;
}

function iso(unixSeconds: number | null): string | null {
  return unixSeconds != null ? new Date(unixSeconds * 1000).toISOString() : null;
}

export interface ExecContext {
  orgId: string | null;
  clientId: string | null;
  stripeAccountId?: string;
  /** The local subscriptions.id if the row already exists; null before checkout. */
  subscriptionRowId: string | null;
  /** newState.lastEventAt — persisted onto the subscription row on every upsert. */
  newLastEventAt: number | null;
}

export async function executeEffects(
  service: Service,
  event: WebhookEvent,
  ctx: ExecContext,
  effects: Effect[],
): Promise<void> {
  // Mutable — a fresh subscription insert fills this in for later effects.
  let rowId = ctx.subscriptionRowId;

  for (const effect of effects) {
    switch (effect.kind) {
      case "upsert_subscription": {
        const patch: Database["public"]["Tables"]["subscriptions"]["Update"] = {
          status: effect.status,
          pause_reason: effect.pauseReason,
          dunning_stage: effect.dunningStage,
          cancel_at_period_end: effect.cancelAtPeriodEnd,
          last_event_at: iso(ctx.newLastEventAt),
        };
        // Only overwrite these when the event actually carried them, so a
        // payment_failed (which has no period end) never nulls the real one.
        if (effect.currentPeriodEnd != null) patch.current_period_end = iso(effect.currentPeriodEnd);
        if (effect.stripeSubscriptionId) patch.stripe_subscription_id = effect.stripeSubscriptionId;
        if (effect.stripeCustomerId) patch.stripe_customer_id = effect.stripeCustomerId;
        if (effect.tierId) patch.tier_id = effect.tierId;

        if (rowId) {
          ok(await service.from("subscriptions").update(patch).eq("id", rowId));
        } else if (ctx.orgId && ctx.clientId) {
          const { data, error } = await service
            .from("subscriptions")
            .insert({ org_id: ctx.orgId, client_id: ctx.clientId, ...patch })
            .select("id")
            .single();
          if (error) throw error;
          rowId = data?.id ?? null;
          if (!rowId) throw new Error("effects: subscription insert returned no id");
        }
        break;
      }

      case "set_client_status": {
        if (ctx.orgId && ctx.clientId) {
          // Becoming active via a real subscription retires the P2/8.6
          // approved_manually stopgap — the client is now a paying member.
          const patch: { status: typeof effect.status; approved_manually?: boolean } = {
            status: effect.status,
          };
          if (effect.status === "active") patch.approved_manually = false;
          ok(
            await service
              .from("clients")
              .update(patch)
              .eq("id", ctx.clientId)
              .eq("org_id", ctx.orgId),
          );
        }
        break;
      }

      case "record_payment": {
        if (ctx.orgId && ctx.clientId) {
          // insert-or-skip on the unique stripe_invoice_id → replay-safe.
          ok(await service.from("payment_records").upsert(
            {
              org_id: ctx.orgId,
              client_id: ctx.clientId,
              subscription_id: rowId,
              stripe_invoice_id: effect.invoiceId ?? null,
              amount_cents: effect.amountCents,
              application_fee_cents: effect.applicationFeeCents,
              currency: effect.currency,
              status: effect.status,
              period_start: iso(effect.periodStart),
              period_end: iso(effect.periodEnd),
            },
            { onConflict: "stripe_invoice_id", ignoreDuplicates: true },
          ));
        }
        break;
      }

      case "notify_client": {
        if (ctx.orgId && ctx.clientId) {
          // System voice (P6) — queued for the delivery ladder (8.4). Deduped so
          // a redelivered event never double-nudges.
          const key = `pay:${ctx.clientId}:${effect.template}:${event.invoiceId ?? event.created}`;
          ok(await service.from("notifications").upsert(
            {
              org_id: ctx.orgId,
              client_id: ctx.clientId,
              kind: `payment_${effect.template}`,
              payload: { template: effect.template },
              channel: "in_app",
              status: "queued",
              dedupe_key: key,
            },
            { onConflict: "dedupe_key", ignoreDuplicates: true },
          ));
        }
        break;
      }

      case "set_connect_status": {
        if (ctx.stripeAccountId) {
          ok(
            await service
              .from("connect_accounts")
              .update({
                charges_enabled: effect.chargesEnabled,
                payouts_enabled: effect.payoutsEnabled,
              })
              .eq("stripe_account_id", ctx.stripeAccountId),
          );
        }
        break;
      }

      case "flag_trainer": {
        if (ctx.orgId) {
          await recordAudit(service, {
            orgId: ctx.orgId,
            action: `payment_flag.${effect.flag}`,
            entityType: "subscription",
            entityId: rowId,
            payload: { client_id: ctx.clientId, flag: effect.flag },
          });
        }
        break;
      }

      case "flag_platform_admin": {
        if (ctx.orgId) {
          await recordAudit(service, {
            orgId: ctx.orgId,
            action: `admin_flag.${effect.reason}`,
            entityType: "subscription",
            entityId: rowId,
            payload: { reason: effect.reason },
          });
        }
        break;
      }

      case "ledger_mark_gap_not_expected": {
        // Fairness rule: a payment gap is never a "missed" day. The marker is
        // recorded here; the day-close expectations engine (8.4) suppresses
        // expectations while a subscription is in dunning.
        if (ctx.orgId) {
          await recordAudit(service, {
            orgId: ctx.orgId,
            action: "ledger.payment_gap_not_expected",
            entityType: "subscription",
            entityId: rowId,
            payload: { client_id: ctx.clientId },
          });
        }
        break;
      }

      case "audit": {
        if (ctx.orgId) {
          await recordAudit(service, {
            orgId: ctx.orgId,
            action: effect.action,
            entityType: "subscription",
            entityId: rowId,
            payload: { event_type: event.type, event_created: event.created },
          });
        }
        break;
      }
    }
  }
}
