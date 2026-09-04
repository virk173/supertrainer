-- Phase 9.4 — the referral engine.
--
-- Two loops, one ledger. A trainer refers another trainer (both get platform
-- credit); a client brings a friend (the friend arrives as a normal, correctly
-- attributed lead). Credit is never granted at signup — only after the referred
-- org is genuinely a customer — because a growth loop that pays on signup pays
-- for fraud.

-- P0 defined teaser|invite|import; a referred friend is none of those, and
-- calling them "teaser" would erase the attribution the trainer earned.
alter type public.client_source add value if not exists 'referral';

-- Trainer-controlled, default OFF (spec §8): asking clients to recruit is a
-- choice about the coaching relationship, not a growth lever we get to pull.
alter table public.orgs
  add column if not exists client_referrals_enabled boolean not null default false;

comment on column public.orgs.client_referrals_enabled is
  'Phase 9.4 — show clients a "bring a friend" card. Off unless the trainer turns it on.';
