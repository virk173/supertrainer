-- Client import batches (Phase 1.5). Each switcher import is a batch so it can
-- be undone within 24h. Imported clients link back to their batch.

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  source text not null default 'csv',
  row_count integer not null default 0,
  undone_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index import_batches_org_id_idx on public.import_batches (org_id);

-- Imported clients carry their batch id so an undo can remove exactly this
-- import's rows. Nullable: teaser/invite clients have no batch.
alter table public.clients
  add column import_batch_id uuid references public.import_batches (id) on delete set null;

create index clients_import_batch_id_idx
  on public.clients (import_batch_id)
  where import_batch_id is not null;

create trigger set_import_batches_updated_at
  before update on public.import_batches
  for each row execute function public.set_updated_at();

-- ── RLS + grants ─────────────────────────────────────────────────────────────

alter table public.import_batches enable row level security;

grant select, insert, update, delete on table public.import_batches to authenticated;
grant all on table public.import_batches to service_role;

create policy "staff full access to org import batches"
  on public.import_batches for all
  to authenticated
  using ((select public.is_org_staff(org_id)))
  with check ((select public.is_org_staff(org_id)));
