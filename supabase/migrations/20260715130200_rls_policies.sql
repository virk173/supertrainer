-- RLS for the core schema. Rules (docs/plan/PHASE-0-foundations.md §0.2):
--   * owners/staff: full access within their org_id
--   * clients: select/update ONLY their own rows (their profile, their client
--     record) and nothing else
--   * audit_log: insert-only for authenticated, select for org owners
--   * service role bypasses RLS via the server-only client (packages/db)
-- Org/profile lifecycle (create org, assign roles) runs through the service
-- role, so orgs/profiles have no INSERT/DELETE policies for API roles.

-- ── Enable RLS everywhere ────────────────────────────────────────────────────

alter table public.orgs enable row level security;
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.audit_log enable row level security;
alter table public.events enable row level security;

-- ── API role grants ──────────────────────────────────────────────────────────
-- Supabase's default privileges do NOT grant API roles access to new tables —
-- every table must grant exactly what each role needs (RLS then narrows rows).
-- service_role bypasses RLS but still requires table grants.
-- NOTE for future migrations: every new table needs its own grants block.

grant select, insert, update, delete
  on table public.orgs, public.clients, public.events
  to authenticated;

-- Privilege-escalation guard: org_id/role are never writable through the API,
-- and profile lifecycle (create/delete, role assignment) is service-role only.
-- So API roles get SELECT + a column-limited UPDATE — never INSERT/DELETE.
grant select on table public.profiles to authenticated;
grant update (display_name, timezone, locale, avatar_url)
  on table public.profiles
  to authenticated;

-- Append-only: no UPDATE/DELETE grant exists at all.
grant select, insert on table public.audit_log to authenticated;

grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- ── orgs ─────────────────────────────────────────────────────────────────────

create policy "staff can read own org"
  on public.orgs for select
  to authenticated
  using ((select public.is_org_staff(id)));

create policy "staff can update own org"
  on public.orgs for update
  to authenticated
  using ((select public.is_org_staff(id)))
  with check ((select public.is_org_staff(id)));

-- ── profiles ─────────────────────────────────────────────────────────────────

-- Required for the custom access token hook to read org_id/role.
create policy "auth admin can read profiles"
  on public.profiles for select
  to supabase_auth_admin
  using (true);

-- Staff read every profile in their org and update the column-limited set
-- above — but INSERT/DELETE are not granted, so creating or removing profiles
-- (and thus minting owners or deleting an owner) stays service-role only.
create policy "staff can read org profiles"
  on public.profiles for select
  to authenticated
  using ((select public.is_org_staff(org_id)));

create policy "staff can update org profiles"
  on public.profiles for update
  to authenticated
  using ((select public.is_org_staff(org_id)))
  with check ((select public.is_org_staff(org_id)));

create policy "users can read own profile"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

create policy "users can update own profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ── clients ──────────────────────────────────────────────────────────────────

create policy "staff full access to org clients"
  on public.clients for all
  to authenticated
  using ((select public.is_org_staff(org_id)))
  with check ((select public.is_org_staff(org_id)));

create policy "clients can read own record"
  on public.clients for select
  to authenticated
  using (profile_id = (select auth.uid()));

create policy "clients can update own record"
  on public.clients for update
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- Structural and trainer/system-controlled columns stay read-only for
-- client-role users (status changes, org moves, consent hashes/timestamps, and
-- trainer health flags go through staff or the service role). Clients may still
-- edit their own intake questionnaire.
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
      or new.consent_doc_hash is distinct from old.consent_doc_hash
      or new.consent_signed_at is distinct from old.consent_signed_at
      or new.health_flags is distinct from old.health_flags then
      raise exception 'clients cannot modify restricted columns';
    end if;
  end if;
  return new;
end;
$$;

create trigger clients_guard_restricted_updates
  before update on public.clients
  for each row execute function public.clients_block_restricted_updates();

-- ── audit_log (append-only) ──────────────────────────────────────────────────

-- Append-only, and the actor cannot be spoofed: an authenticated caller may
-- only attribute a row to themselves (or leave it null for system events).
-- Cross-actor/backfilled audit rows go through the service role.
create policy "authenticated can append audit rows for own org"
  on public.audit_log for insert
  to authenticated
  with check (
    org_id = (select public.jwt_org_id())
    and (
      actor_profile_id is null
      or actor_profile_id = (select auth.uid())
    )
  );

create policy "owners can read org audit log"
  on public.audit_log for select
  to authenticated
  using (
    (select public.jwt_user_role()) = 'owner'
    and org_id = (select public.jwt_org_id())
  );

-- ── events ───────────────────────────────────────────────────────────────────

create policy "staff full access to org events"
  on public.events for all
  to authenticated
  using ((select public.is_org_staff(org_id)))
  with check ((select public.is_org_staff(org_id)));
