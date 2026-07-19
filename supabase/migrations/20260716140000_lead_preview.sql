-- Teaser preview cache + manual-approval flag (Phase 2.2).

-- The generated preview is cached on the lead so revisits never regenerate
-- (each generation is a paid AI call). Written only by the service role
-- (leads grants API roles nothing but SELECT), so no new grants are needed.
alter table public.leads
  add column preview jsonb,
  add column preview_generated_at timestamptz;

-- Teaser conversions create a client with status='onboarding'. Until Stripe
-- lands (Phase 8), a trainer manually approves the client ("confirm your spot"),
-- which sets status='active' and records approved_manually=true. Phase 8.6
-- migrates these to real subscriptions.
alter table public.clients
  add column approved_manually boolean not null default false;

-- Clients must not flip their own approval (or status). Add approved_manually to
-- the client-restricted columns guard — a client-role update touching it raises.
create or replace function public.clients_block_restricted_updates()
returns trigger
language plpgsql
as $$
begin
  if public.jwt_user_role() = 'client' then
    if new.org_id is distinct from old.org_id
      or new.profile_id is distinct from old.profile_id
      or new.status is distinct from old.status
      or new.source is distinct from old.source
      or new.is_demo is distinct from old.is_demo
      or new.approved_manually is distinct from old.approved_manually
      or new.consent_doc_hash is distinct from old.consent_doc_hash
      or new.consent_signed_at is distinct from old.consent_signed_at
      or new.health_flags is distinct from old.health_flags then
      raise exception 'clients cannot modify restricted columns';
    end if;
  end if;
  return new;
end;
$$;
