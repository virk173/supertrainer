// Phase 8.3 — the webhook state-machine contracts. Pure types shared by the
// state machine, its fixtures, and the effect executor. No behavior here.

export type SubStatus =
  | "incomplete"
  | "trialing"
  | "active"
  | "past_due"
  | "paused"
  | "canceled"
  | "unpaid";

export type PauseReason = "none" | "dunning" | "vacation";

/** The local subscription state the machine reasons over (a projection of the
 *  subscriptions row). `lastEventAt` is the Stripe `created` (unix seconds) of
 *  the most recent subscription-scoped event applied — the out-of-order guard. */
export interface SubState {
  exists: boolean;
  status: SubStatus;
  pauseReason: PauseReason;
  dunningStage: number;
  cancelAtPeriodEnd: boolean;
  lastEventAt: number | null;
}

export type WebhookEventType =
  | "checkout.session.completed"
  | "invoice.paid"
  | "invoice.payment_failed"
  | "customer.subscription.updated"
  | "customer.subscription.deleted"
  | "customer.subscription.paused"
  | "customer.subscription.resumed"
  | "account.updated"
  | "account.application.deauthorized"
  | "charge.dispute.created";

/** A normalized Stripe event — the route flattens the raw Stripe payload into
 *  this before the pure machine sees it (so the machine never touches Stripe SDK
 *  shapes and stays trivially testable). */
export interface WebhookEvent {
  type: WebhookEventType;
  created: number; // unix seconds
  // Executor context (resolved from Stripe metadata / event.account). The PURE
  // machine ignores these; the route uses them to locate the org/client/account.
  orgId?: string;
  clientId?: string;
  stripeAccountId?: string;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  tierId?: string;
  subscriptionStatus?: SubStatus;
  currentPeriodEnd?: number | null;
  cancelAtPeriodEnd?: boolean;
  // invoice
  invoiceId?: string;
  amountCents?: number;
  applicationFeeCents?: number;
  currency?: string;
  periodStart?: number | null;
  periodEnd?: number | null;
  // connect
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  // dispute
  disputeId?: string;
}

export type NotifyTemplate =
  | "welcome"
  | "payment_failed"
  | "payment_recovered"
  | "plan_paused"
  | "subscription_canceled";

export type TrainerFlag = "payment_failed" | "dispute" | "connect_deauthorized";

/** The side effects the executor runs transactionally with the state write. The
 *  pure machine only DESCRIBES them; nothing here performs I/O. */
export type Effect =
  | {
      kind: "upsert_subscription";
      status: SubStatus;
      pauseReason: PauseReason;
      dunningStage: number;
      cancelAtPeriodEnd: boolean;
      currentPeriodEnd: number | null;
      stripeSubscriptionId?: string;
      stripeCustomerId?: string;
      tierId?: string;
    }
  | { kind: "set_client_status"; status: "active" | "paused" | "churned" | "onboarding" }
  | {
      kind: "record_payment";
      invoiceId?: string;
      amountCents: number;
      applicationFeeCents: number;
      currency: string;
      status: "paid" | "failed";
      periodStart: number | null;
      periodEnd: number | null;
    }
  | { kind: "notify_client"; template: NotifyTemplate }
  | { kind: "flag_trainer"; flag: TrainerFlag }
  | { kind: "flag_platform_admin"; reason: "dispute" | "connect_deauthorized" }
  | { kind: "ledger_mark_gap_not_expected" }
  | { kind: "set_connect_status"; chargesEnabled: boolean; payoutsEnabled: boolean }
  | { kind: "audit"; action: string };

export interface Transition {
  newState: SubState;
  effects: Effect[];
}
