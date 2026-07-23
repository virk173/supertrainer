-- Phase 5.3 — give workout_logs.exercise_id a real exercises FK (the P3.3 note),
-- open a trainer WRITE path on exercise_videos, and create the demo-video bucket.
--
-- P3.3 left workout_logs.exercise_id as unconstrained text because the exercises
-- catalog didn't exist yet. Now it does (P5.1) and approved splits reference
-- catalog ids (P5.3 approve), so set-logging pre-fill resolves to real rows.

-- Pre-catalog free-text logs (demo/dev only — no real client data pre-launch)
-- can't satisfy the FK; drop them so the column can adopt the uuid type.
delete from public.workout_logs
  where exercise_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

alter table public.workout_logs
  alter column exercise_id type uuid using exercise_id::uuid;

-- restrict: a logged exercise can't be hard-deleted out from under its history
-- (org-custom exercises are archived, not deleted, once referenced).
alter table public.workout_logs
  add constraint workout_logs_exercise_id_fkey
  foreign key (exercise_id) references public.exercises (id) on delete restrict;

-- ── exercise_videos trainer write path ───────────────────────────────────────
-- P5.1 shipped exercise_videos read-only to API roles (service-role writes). The
-- library manager (P5.3) lets org staff manage their OWN org's video overrides
-- (org_id = their org); platform defaults (org_id null) stay service-role only.
grant insert, update, delete on table public.exercise_videos to authenticated;

create policy "org staff insert own org videos"
  on public.exercise_videos for insert
  to authenticated
  with check (
    org_id is not null and org_id = (select public.jwt_org_id()) and (select public.is_org_staff(org_id))
  );

create policy "org staff update own org videos"
  on public.exercise_videos for update
  to authenticated
  using (org_id is not null and (select public.is_org_staff(org_id)))
  with check (org_id is not null and org_id = (select public.jwt_org_id()));

create policy "org staff delete own org videos"
  on public.exercise_videos for delete
  to authenticated
  using (org_id is not null and (select public.is_org_staff(org_id)));

-- ── exercise-videos storage bucket ───────────────────────────────────────────
-- Private; namespaced {org_id}/{exercise_id}/{file}. Org staff read/write their
-- own org's demos; their clients read them (session player). 100 MB cap, mp4/mov.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exercise-videos', 'exercise-videos', false, 104857600,
  array['video/mp4', 'video/quicktime']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "org staff read own exercise videos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'exercise-videos'
    and (select public.is_org_staff((((storage.foldername(name))[1])::uuid)))
  );
create policy "clients read own org exercise videos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'exercise-videos'
    and (storage.foldername(name))[1] in (
      select org_id::text from public.clients where profile_id = (select auth.uid())
    )
  );
create policy "org staff write own exercise videos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'exercise-videos'
    and (select public.is_org_staff((((storage.foldername(name))[1])::uuid)))
  );
create policy "org staff delete own exercise videos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'exercise-videos'
    and (select public.is_org_staff((((storage.foldername(name))[1])::uuid)))
  );
