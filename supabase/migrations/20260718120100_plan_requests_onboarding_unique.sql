-- Phase 2 backstop: a DB-level guarantee that a client gets at most one diet and
-- one split onboarding plan_request. completeIntake already guards with a
-- count-check, but two concurrent finalizes could both pass it; this partial
-- unique index is the real backstop (the app now treats a 23505 here as
-- "already queued"). monthly/manual triggers are intentionally unconstrained.

-- Defensive: collapse any pre-existing onboarding duplicates (keep the earliest)
-- so the unique index can be created on existing data.
delete from public.plan_requests p
using public.plan_requests q
where p.trigger = 'onboarding'
  and q.trigger = 'onboarding'
  and p.client_id = q.client_id
  and p.kind = q.kind
  and (q.created_at < p.created_at
       or (q.created_at = p.created_at and q.id < p.id));

create unique index plan_requests_onboarding_unique
  on public.plan_requests (client_id, kind)
  where trigger = 'onboarding';
