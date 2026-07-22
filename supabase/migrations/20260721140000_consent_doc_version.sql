-- PO-3 — consent re-sign on a material document-version bump.
--
-- The portal/welcome consent gate previously checked only whether a client had
-- EVER signed (clients.consent_signed_at). When the lawyer-reviewed template
-- moves v1 → v2 (materially), every existing client keeps operating under stale
-- consent. To let the gate compare cheaply, denormalize the client's latest
-- signed version onto clients — mirroring consent_doc_hash — so the check stays a
-- single indexed read on the client's own row. The append-only consents table
-- remains the durable evidence and history.

alter table public.clients add column consent_doc_version text;

-- Backfill from the append-only evidence so existing signed clients are NOT
-- forced to re-sign at deploy: each signed client keeps the version they last
-- signed (with only v1 shipped, that's v1, which the code treats as current).
update public.clients c
set consent_doc_version = latest.doc_version
from (
  select distinct on (client_id) client_id, doc_version
  from public.consents
  order by client_id, signed_at desc
) latest
where latest.client_id = c.id
  and c.consent_signed_at is not null;

-- consent_doc_version is set only by the service-role recordConsent action. A
-- client-role user must not be able to bump their own version to dodge a required
-- re-sign — add it to the client-restricted-columns guard alongside the other
-- consent flags.
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
      or new.consent_doc_version is distinct from old.consent_doc_version
      or new.consent_signed_at is distinct from old.consent_signed_at
      or new.health_flags is distinct from old.health_flags then
      raise exception 'clients cannot modify restricted columns';
    end if;
  end if;
  return new;
end;
$$;
