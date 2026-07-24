-- Phase 8.1 — add the 'payments' step to the trainer activation checklist.
--
-- Master funnel step 7 (MASTER-PLAN §5.1): connecting Stripe + enabling paid
-- tiers becomes a visible onboarding card. The checklist (app-side ONBOARDING_STEPS)
-- reads this enum as the source of truth. Isolated in its own migration: PG16
-- allows ALTER TYPE ADD VALUE inside a transaction only when the new value is
-- not USED in the same transaction — this file adds it and nothing else.
alter type public.onboarding_step add value if not exists 'payments';
