-- PO-5 — auto-generated trainer "client brief" on Stage B completion.
--
-- completeIntake assembles a structured clients.intake blob, but the trainer's
-- first exposure to a new human is otherwise a pile of JSON. Store a short
-- neutral-voice brief (drafted by modelRouter('draft'), Zod-validated, with an
-- authoritative code-derived health-flag list) on the client row so Phase 7's
-- per-client inbox / health-review queue can render it as the header. One brief
-- per client; regenerated only if absent (the generation is a paid AI call).

alter table public.clients
  add column brief jsonb,
  add column brief_generated_at timestamptz;

-- The brief is trainer-facing derived data written only by the service role
-- (the completeIntake path). A client-role user must not edit their own brief
-- (which surfaces their health flags to the coach) — add it to the
-- client-restricted-columns guard alongside the other privileged columns.
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
      or new.health_flags is distinct from old.health_flags
      or new.brief is distinct from old.brief
      or new.brief_generated_at is distinct from old.brief_generated_at then
      raise exception 'clients cannot modify restricted columns';
    end if;
  end if;
  return new;
end;
$$;
