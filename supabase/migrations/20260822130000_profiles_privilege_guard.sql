-- SECURITY FIX — privilege escalation + tenant hop via public.profiles.
--
-- The "users can update own profile" policy (correctly) lets a signed-in user
-- edit their own row. The defence against them editing the SENSITIVE columns on
-- that row was a COLUMN-level UPDATE grant that excluded role/org_id. Supabase
-- now grants API roles table-wide privileges on public tables by default, which
-- silently removed that defence: `authenticated` held UPDATE on every column,
-- so a client could run
--     update public.profiles set role = 'owner' where id = auth.uid();
-- and become org staff — is_org_staff() then returns true, exposing every other
-- client's health data, plans, messages and payments. Setting org_id instead let
-- them hop into a different tenant entirely.
--
-- Two independent guards, so neither a future grant-default change nor a policy
-- edit can re-open this:
--   1. column-scoped UPDATE grant (re-asserted explicitly, not inherited)
--   2. a trigger that rejects any change to id/org_id/role from a non-service role
-- Verified by rls_core_schema_test ("client cannot escalate their own role").

-- ── 1. re-assert the column-scoped UPDATE grant ──────────────────────────────
revoke update on table public.profiles from authenticated;
revoke update on table public.profiles from anon;

-- Only the genuinely self-editable presentation columns.
grant update (display_name, avatar_url, locale, timezone)
  on table public.profiles to authenticated;

-- ── 2. trigger guard (belt to the grant's braces) ────────────────────────────
create or replace function public.profiles_block_restricted_updates()
returns trigger
language plpgsql
as $$
begin
  -- current_user is the API role on a PostgREST request ('authenticated'/'anon');
  -- the service role and superusers legitimately manage these columns.
  if current_user not in ('service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin') then
    if new.id is distinct from old.id
      or new.org_id is distinct from old.org_id
      or new.role is distinct from old.role then
      raise exception 'profiles: id, org_id and role are not self-editable';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_block_restricted_updates on public.profiles;
create trigger profiles_block_restricted_updates
  before update on public.profiles
  for each row execute function public.profiles_block_restricted_updates();

-- ── 3. push_subscriptions: restore the no-DELETE design ──────────────────────
-- Subscriptions are SOFT-revoked (the delivery ladder prunes dead endpoints and
-- keeps the row); the blanket grant accidentally let a client hard-delete their
-- own row. No application code deletes here, so revoking is behaviour-preserving.
revoke delete on table public.push_subscriptions from authenticated;
revoke delete on table public.push_subscriptions from anon;
