-- Demo client flag (Phase 1.6). Every org can seed a badged "Alex Demo" client
-- so screens are never empty. is_demo is excluded from analytics aggregates,
-- exports, and billing counts (shared helper in packages/db) — a rule every
-- later phase inherits.

alter table public.clients
  add column is_demo boolean not null default false;

-- Partial index: the exclusion filter and the "one demo per org" lookups only
-- ever touch demo rows, which are a tiny minority.
create index clients_org_id_is_demo_idx
  on public.clients (org_id)
  where is_demo;

-- Client-role users must not flip themselves (or anyone) to demo. is_demo is
-- staff/service-controlled — add it to the client-restricted columns guard.
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
      or new.consent_doc_hash is distinct from old.consent_doc_hash
      or new.consent_signed_at is distinct from old.consent_signed_at
      or new.health_flags is distinct from old.health_flags then
      raise exception 'clients cannot modify restricted columns';
    end if;
  end if;
  return new;
end;
$$;
