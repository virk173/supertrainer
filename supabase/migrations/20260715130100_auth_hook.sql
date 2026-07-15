-- JWT claim helpers + custom access token hook.
-- The hook injects org_id and user_role claims from public.profiles into every
-- access token, so RLS policies never need a recursive lookup on profiles.
-- Enabled locally via [auth.hook.custom_access_token] in supabase/config.toml;
-- on hosted projects it must also be enabled under Authentication → Hooks.

-- ── Claim readers used by RLS policies ───────────────────────────────────────

create or replace function public.jwt_org_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'org_id', '')::uuid;
$$;

create or replace function public.jwt_user_role()
returns public.org_role
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'user_role', '')::public.org_role;
$$;

-- True when the caller is an owner/staff member of the given org.
create or replace function public.is_org_staff(check_org_id uuid)
returns boolean
language sql
stable
as $$
  select public.jwt_user_role() in ('owner', 'staff')
     and public.jwt_org_id() = check_org_id;
$$;

-- ── Custom access token hook ─────────────────────────────────────────────────

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb;
  user_profile record;
begin
  select org_id, role
    into user_profile
    from public.profiles
   where id = (event ->> 'user_id')::uuid;

  claims := event -> 'claims';

  if user_profile.org_id is not null then
    claims := jsonb_set(claims, '{org_id}', to_jsonb(user_profile.org_id::text));
    claims := jsonb_set(claims, '{user_role}', to_jsonb(user_profile.role::text));
  else
    -- Freshly signed-up users have no profile yet (org bootstrap happens in
    -- the Phase 0.3 post-signup action, followed by a token refresh).
    claims := jsonb_set(claims, '{org_id}', 'null'::jsonb);
    claims := jsonb_set(claims, '{user_role}', 'null'::jsonb);
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- ── Permissions (per Supabase auth-hooks security model) ─────────────────────

grant usage on schema public to supabase_auth_admin;

grant execute
  on function public.custom_access_token_hook
  to supabase_auth_admin;

revoke execute
  on function public.custom_access_token_hook
  from authenticated, anon, public;

-- The hook reads profiles as supabase_auth_admin; the matching RLS policy is
-- created in the RLS migration.
grant select on table public.profiles to supabase_auth_admin;
