-- Brand assets storage (Phase 1.2). Trainer logos live in a public-read
-- 'brand' bucket; objects are namespaced by org id (`{org_id}/logo.<ext>`) so
-- write policies can scope by folder. Public read because logos render on
-- unauthenticated teaser/portal pages.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand',
  'brand',
  true,
  2097152, -- 2 MB
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── Object policies ──────────────────────────────────────────────────────────
-- Read: anyone (the bucket is public; this covers the authenticated path too).
-- Write/update/delete: org staff only, and only within their own org's folder.
-- The first path segment is the org id; is_org_staff() checks the caller's JWT
-- claim matches it. A non-uuid first segment fails the cast and is rejected —
-- exactly what we want for anything not written by our app.

create policy "brand assets are publicly readable"
  on storage.objects for select
  using (bucket_id = 'brand');

create policy "staff upload brand assets for own org"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'brand'
    and public.is_org_staff((((storage.foldername(name))[1])::uuid))
  );

create policy "staff update brand assets for own org"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'brand'
    and public.is_org_staff((((storage.foldername(name))[1])::uuid))
  )
  with check (
    bucket_id = 'brand'
    and public.is_org_staff((((storage.foldername(name))[1])::uuid))
  );

create policy "staff delete brand assets for own org"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'brand'
    and public.is_org_staff((((storage.foldername(name))[1])::uuid))
  );
