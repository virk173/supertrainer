-- Style-learning ingestion (Phase 1.3, master plan §4.2). Trainers upload past
-- plans/check-ins → extracted text → per-domain style profiles they confirm.
-- The confirmed profiles drive every AI draft in P4/P5/P6.

-- pgvector for exemplar embeddings. Embeddings are populated by a later phase
-- (P4.3 nightly job); the column is nullable and dimensionless here so we don't
-- commit to an embedding model's dimension yet. Installed in `extensions`
-- (Supabase convention) and schema-qualified so it resolves on fresh hosted
-- projects, not just the CLI's pre-enabled local stack.
create extension if not exists vector with schema extensions;

-- ── Enums ────────────────────────────────────────────────────────────────────

create type public.style_domain as enum ('diet', 'training', 'voice');
create type public.style_profile_status as enum ('draft', 'confirmed');
create type public.style_exemplar_source as enum ('upload', 'edit_capture');
create type public.upload_kind as enum ('plan_pdf', 'checkin_screenshot', 'doc');
create type public.upload_extraction_status
  as enum ('pending', 'processing', 'done', 'failed');

-- ── uploads ──────────────────────────────────────────────────────────────────
-- One row per file dropped into the 'ingestion' bucket. The extraction worker
-- fills extracted_text and advances extraction_status.

create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  bucket_path text not null,
  kind public.upload_kind not null,
  extracted_text text,
  extraction_status public.upload_extraction_status not null default 'pending',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index uploads_org_id_idx on public.uploads (org_id);

-- ── style_profiles ───────────────────────────────────────────────────────────
-- Versioned JSON per (org, domain). The extractor writes a draft (version 1);
-- confirming stamps confirmed_at and status='confirmed'. created_from lists the
-- upload ids that produced it.

create table public.style_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  domain public.style_domain not null,
  version int not null default 1,
  profile jsonb not null default '{}'::jsonb,
  status public.style_profile_status not null default 'draft',
  -- upload ids (or other source tags) this profile was extracted from
  created_from text[] not null default '{}',
  confidence real,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, domain, version)
);

create index style_profiles_org_id_domain_idx
  on public.style_profiles (org_id, domain);

-- ── style_exemplars ──────────────────────────────────────────────────────────
-- Verbatim snippets (from uploads now; from trainer edit-capture later) that
-- seed few-shot prompting. Embeddings land in P4.3 — nullable/dimensionless.

create table public.style_exemplars (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  domain public.style_domain not null,
  content text not null,
  embedding extensions.vector,
  source public.style_exemplar_source not null,
  quality_score real,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index style_exemplars_org_id_domain_idx
  on public.style_exemplars (org_id, domain);

-- ── updated_at triggers ──────────────────────────────────────────────────────

create trigger set_uploads_updated_at
  before update on public.uploads
  for each row execute function public.set_updated_at();

create trigger set_style_profiles_updated_at
  before update on public.style_profiles
  for each row execute function public.set_updated_at();

create trigger set_style_exemplars_updated_at
  before update on public.style_exemplars
  for each row execute function public.set_updated_at();

-- ── RLS + grants ─────────────────────────────────────────────────────────────
-- Staff-only surfaces: owners/staff manage their own org's ingestion data;
-- clients never touch it. Supabase grants API roles nothing by default.

alter table public.uploads enable row level security;
alter table public.style_profiles enable row level security;
alter table public.style_exemplars enable row level security;

grant select, insert, update, delete
  on table public.uploads, public.style_profiles, public.style_exemplars
  to authenticated;
grant all
  on table public.uploads, public.style_profiles, public.style_exemplars
  to service_role;

create policy "staff full access to org uploads"
  on public.uploads for all
  to authenticated
  using ((select public.is_org_staff(org_id)))
  with check ((select public.is_org_staff(org_id)));

create policy "staff full access to org style profiles"
  on public.style_profiles for all
  to authenticated
  using ((select public.is_org_staff(org_id)))
  with check ((select public.is_org_staff(org_id)));

create policy "staff full access to org style exemplars"
  on public.style_exemplars for all
  to authenticated
  using ((select public.is_org_staff(org_id)))
  with check ((select public.is_org_staff(org_id)));

-- ── Ingestion storage bucket ─────────────────────────────────────────────────
-- Private (unlike brand): raw trainer plans/screenshots are sensitive. Objects
-- are namespaced by org id; only that org's staff can read or write.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ingestion',
  'ingestion',
  false,
  10485760, -- 10 MB
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png', 'image/jpeg', 'image/webp'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "staff read own org ingestion files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'ingestion'
    and public.is_org_staff((((storage.foldername(name))[1])::uuid))
  );

create policy "staff upload own org ingestion files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'ingestion'
    and public.is_org_staff((((storage.foldername(name))[1])::uuid))
  );

create policy "staff delete own org ingestion files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'ingestion'
    and public.is_org_staff((((storage.foldername(name))[1])::uuid))
  );
