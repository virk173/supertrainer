-- Click-wrap consent evidence trail (Phase 2.3). Append-only: one immutable row
-- per signature, capturing the exact document version + its sha256, the typed
-- name, timestamp, IP, and user agent. clients.consent_signed_at/consent_doc_hash
-- (core schema) are the denormalized flags the portal guard reads; this table is
-- the durable evidence. Writes go through the recordConsent action (service
-- role) because they also set client-restricted columns — so API roles get read
-- access only.

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  doc_version text not null,
  doc_sha256 text not null,
  signed_name text not null,
  signed_at timestamptz not null default now(),
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index consents_org_id_idx on public.consents (org_id);
create index consents_client_id_idx on public.consents (client_id);

-- ── RLS + grants ─────────────────────────────────────────────────────────────
-- Read-only for API roles: staff read their org's consents; a client reads only
-- their own. No insert/update/delete grant — the evidence trail is written by
-- the service role and never mutated (append-only).

alter table public.consents enable row level security;

grant select on table public.consents to authenticated;
grant all on table public.consents to service_role;

create policy "staff read own org consents"
  on public.consents for select
  to authenticated
  using ((select public.is_org_staff(org_id)));

create policy "clients read their own consents"
  on public.consents for select
  to authenticated
  using (
    client_id in (
      select id from public.clients where profile_id = (select auth.uid())
    )
  );

-- ── Consent PDF storage ──────────────────────────────────────────────────────
-- Private bucket; objects namespaced by org id ({orgId}/{clientId}/...). Staff
-- read their own org's PDFs; clients receive their copy by email. Writes are
-- service-role (the recordConsent action) only.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('consents', 'consents', false, 5242880, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "staff read own org consent pdfs"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'consents'
    and public.is_org_staff((((storage.foldername(name))[1])::uuid))
  );
