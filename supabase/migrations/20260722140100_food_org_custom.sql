-- Phase 3.1 — Verified nutrition database: org-custom foods write path.
--
-- P2.2 reserved foods.org_id for a trainer's own recipes (source='org_custom')
-- but granted no write path — the teaser only reads globals. Now trainers can
-- add their own foods (the "unknown food -> save as a recipe" flow lands in
-- P3.2). Two invariants:
--   • an org-owned row is ALWAYS org_custom, and a global row (org_id null) is
--     NEVER org_custom — enforced by a CHECK so neither the app nor a stray
--     service-role write can create a mislabelled row;
--   • a trainer can only touch their OWN org's custom foods — enforced by RLS.
-- Allergen tags are required-on-creation; because the DB can't tell "explicitly
-- none" from "defaulted empty", that rule is enforced in the createOrgCustomFood
-- action (packages/db) with a Zod-validated explicit allergen decision, mirroring
-- how Stage A intake forces an explicit allergy choice.

-- org_custom  <=>  org-owned. Existing global rows (org_id null, source
-- usda/ifct/seed) all satisfy the first branch, so this validates in place.
alter table public.foods
  add constraint foods_org_custom_ownership check (
    (org_id is null and source <> 'org_custom')
    or (org_id is not null and source = 'org_custom')
  );

-- Writes were service-role only in P2.2. Grant the DML to authenticated and let
-- RLS narrow it to a trainer's own org-custom foods.
grant insert, update, delete on table public.foods to authenticated;

create policy "org staff insert own custom foods"
  on public.foods for insert
  to authenticated
  with check (
    source = 'org_custom'
    and org_id is not null
    and (select public.is_org_staff(org_id))
  );

create policy "org staff update own custom foods"
  on public.foods for update
  to authenticated
  using (
    source = 'org_custom'
    and org_id is not null
    and (select public.is_org_staff(org_id))
  )
  with check (
    source = 'org_custom'
    and org_id is not null
    and (select public.is_org_staff(org_id))
  );

create policy "org staff delete own custom foods"
  on public.foods for delete
  to authenticated
  using (
    source = 'org_custom'
    and org_id is not null
    and (select public.is_org_staff(org_id))
  );
