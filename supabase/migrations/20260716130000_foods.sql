-- Verified nutrition database (Phase 2.2). v0 of the foods DB: a shared,
-- verified reference table that powers the teaser preview's macro math. Phase
-- 3.1 extends it with full USDA/OFF/IFCT imports and org-custom foods.
--
-- Rows with org_id IS NULL are GLOBAL verified foods (the seed below); every
-- org reads them. Rows with a non-null org_id are that org's custom foods
-- (source='org_custom', added in P3.1). kcal/macros are per 100 g; the preview
-- computes displayed calories from these values IN CODE — the model never emits
-- a number (CLAUDE.md rule 4).

create type public.food_source as enum ('usda', 'off', 'ifct', 'org_custom', 'seed');

create table public.foods (
  id uuid primary key default gen_random_uuid(),
  -- null = global verified food; set only for org_custom foods (P3.1).
  org_id uuid references public.orgs (id) on delete cascade,
  source public.food_source not null,
  source_ref text,
  name text not null,
  name_normalized text not null,
  cuisine_tags text[] not null default '{}',
  -- canonical allergen vocabulary (packages/ai/allergens.ts): peanut, tree_nut,
  -- dairy, egg, soy, gluten, fish, shellfish, sesame, coconut.
  allergen_tags text[] not null default '{}',
  -- household unit → grams, e.g. {"katori": 150, "piece": 40}.
  serving_units jsonb not null default '{}'::jsonb,
  kcal_per_100g numeric not null,
  protein_per_100g numeric not null default 0,
  carbs_per_100g numeric not null default 0,
  fat_per_100g numeric not null default 0,
  fiber_per_100g numeric not null default 0,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index foods_name_normalized_idx on public.foods (name_normalized);
create index foods_allergen_tags_idx on public.foods using gin (allergen_tags);
create index foods_org_id_idx on public.foods (org_id) where org_id is not null;
-- Natural key for the global seed so re-application is idempotent.
create unique index foods_global_key
  on public.foods (name_normalized, source)
  where org_id is null;

create trigger set_foods_updated_at
  before update on public.foods
  for each row execute function public.set_updated_at();

-- ── RLS + grants ─────────────────────────────────────────────────────────────
-- Global foods are readable by every authenticated user; org-custom foods only
-- by that org's staff. Writes are service-role only in P2.2 (the teaser reads
-- through the service role anyway) — org-custom food management arrives in P3.1
-- with its own grants. Supabase grants API roles nothing on new tables by
-- default, so grant SELECT explicitly then let RLS narrow rows.

alter table public.foods enable row level security;

grant select on table public.foods to authenticated;
grant all on table public.foods to service_role;

create policy "read global and own-org foods"
  on public.foods for select
  to authenticated
  using (org_id is null or (select public.is_org_staff(org_id)));

-- ── Global verified seed (generated from packages/db/seed/preview-foods-seed.json) ──
-- 128 common foods across cuisines; macros per 100 g from USDA FDC / IFCT 2017.
insert into public.foods
  (source, source_ref, name, name_normalized, cuisine_tags, allergen_tags, serving_units,
   kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g, verified)
values
  ('usda', 'USDA FDC chicken breast, cooked', 'Chicken breast, cooked', 'chicken breast, cooked', '{global}'::text[], '{}'::text[], '{"palm":85}'::jsonb, 165, 31, 0, 3.6, 0, true),
  ('usda', 'USDA FDC chicken thigh, cooked', 'Chicken thigh, cooked', 'chicken thigh, cooked', '{global}'::text[], '{}'::text[], '{}'::jsonb, 209, 26, 0, 10.9, 0, true),
  ('usda', 'USDA FDC egg, whole, boiled', 'Egg, whole, boiled', 'egg, whole, boiled', '{global}'::text[], '{egg}'::text[], '{"piece":50}'::jsonb, 155, 13, 1.1, 11, 0, true),
  ('usda', 'USDA FDC egg white, raw', 'Egg white', 'egg white', '{global}'::text[], '{egg}'::text[], '{"piece":33}'::jsonb, 52, 11, 0.7, 0.2, 0, true),
  ('usda', 'USDA FDC egg yolk, raw', 'Egg yolk', 'egg yolk', '{global}'::text[], '{egg}'::text[], '{"piece":17}'::jsonb, 322, 16, 3.6, 27, 0, true),
  ('ifct', 'IFCT 2017 paneer', 'Paneer (whole milk)', 'paneer (whole milk)', '{indian}'::text[], '{dairy}'::text[], '{"katori":100}'::jsonb, 296, 18, 6, 22, 0, true),
  ('usda', 'USDA FDC tofu, firm', 'Tofu, firm', 'tofu, firm', '{global,east_asian}'::text[], '{soy}'::text[], '{"block":100}'::jsonb, 144, 17, 3, 9, 2, true),
  ('usda', 'USDA FDC tempeh', 'Tempeh', 'tempeh', '{east_asian}'::text[], '{soy}'::text[], '{}'::jsonb, 192, 20, 8, 11, 0, true),
  ('usda', 'USDA FDC soy milk, unsweetened', 'Soy milk', 'soy milk', '{global}'::text[], '{soy}'::text[], '{"cup":240}'::jsonb, 54, 3.3, 6, 1.8, 0.6, true),
  ('usda', 'USDA FDC soybeans, boiled', 'Soybean, boiled', 'soybean, boiled', '{global}'::text[], '{soy}'::text[], '{"katori":150}'::jsonb, 173, 18, 10, 9, 6, true),
  ('seed', 'whey protein isolate label (per 100 g)', 'Whey protein isolate', 'whey protein isolate', '{supplement}'::text[], '{dairy}'::text[], '{"scoop":30}'::jsonb, 370, 80, 8, 5, 0, true),
  ('usda', 'USDA FDC greek yogurt, nonfat', 'Greek yogurt, nonfat', 'greek yogurt, nonfat', '{global}'::text[], '{dairy}'::text[], '{"cup":245}'::jsonb, 59, 10, 3.6, 0.4, 0, true),
  ('usda', 'USDA FDC cottage cheese, lowfat', 'Cottage cheese, low-fat', 'cottage cheese, low-fat', '{global}'::text[], '{dairy}'::text[], '{"katori":150}'::jsonb, 72, 12, 3, 1, 0, true),
  ('usda', 'USDA FDC salmon, cooked', 'Salmon, cooked', 'salmon, cooked', '{global}'::text[], '{fish}'::text[], '{"fillet":100}'::jsonb, 208, 20, 0, 13, 0, true),
  ('usda', 'USDA FDC tuna, canned in water', 'Tuna, canned in water', 'tuna, canned in water', '{global}'::text[], '{fish}'::text[], '{"can":100}'::jsonb, 116, 26, 0, 1, 0, true),
  ('usda', 'USDA FDC cod, cooked', 'Cod fish, cooked', 'cod fish, cooked', '{global}'::text[], '{fish}'::text[], '{}'::jsonb, 105, 23, 0, 0.9, 0, true),
  ('ifct', 'IFCT 2017 rohu', 'Rohu fish, cooked', 'rohu fish, cooked', '{indian}'::text[], '{fish}'::text[], '{}'::jsonb, 97, 17, 0, 3, 0, true),
  ('usda', 'USDA FDC shrimp, cooked', 'Prawns, cooked', 'prawns, cooked', '{global}'::text[], '{shellfish}'::text[], '{}'::jsonb, 99, 24, 0.2, 0.3, 0, true),
  ('usda', 'USDA FDC crab, cooked', 'Crab, cooked', 'crab, cooked', '{global}'::text[], '{shellfish}'::text[], '{}'::jsonb, 97, 19, 0, 1.5, 0, true),
  ('usda', 'USDA FDC goat meat, cooked', 'Mutton (goat), cooked', 'mutton (goat), cooked', '{indian,global}'::text[], '{}'::text[], '{}'::jsonb, 143, 27, 0, 3, 0, true),
  ('usda', 'USDA FDC beef, lean, cooked', 'Beef, lean, cooked', 'beef, lean, cooked', '{global}'::text[], '{}'::text[], '{}'::jsonb, 217, 26, 0, 12, 0, true),
  ('usda', 'USDA FDC turkey breast, cooked', 'Turkey breast, cooked', 'turkey breast, cooked', '{global}'::text[], '{}'::text[], '{}'::jsonb, 135, 30, 0, 1, 0, true),
  ('ifct', 'IFCT 2017 masoor dal, cooked', 'Red lentils (masoor dal), cooked', 'red lentils (masoor dal), cooked', '{indian}'::text[], '{}'::text[], '{"katori":150}'::jsonb, 116, 9, 20, 0.4, 8, true),
  ('ifct', 'IFCT 2017 toor dal, cooked', 'Pigeon pea (toor dal), cooked', 'pigeon pea (toor dal), cooked', '{indian}'::text[], '{}'::text[], '{"katori":150}'::jsonb, 121, 7, 22, 0.4, 5, true),
  ('ifct', 'IFCT 2017 moong dal, cooked', 'Moong dal, cooked', 'moong dal, cooked', '{indian}'::text[], '{}'::text[], '{"katori":150}'::jsonb, 105, 7, 19, 0.4, 7, true),
  ('ifct', 'IFCT 2017 urad dal, cooked', 'Black gram (urad dal), cooked', 'black gram (urad dal), cooked', '{indian}'::text[], '{}'::text[], '{"katori":150}'::jsonb, 105, 7, 19, 0.4, 7, true),
  ('usda', 'USDA FDC chickpeas, cooked', 'Chickpeas (chana), cooked', 'chickpeas (chana), cooked', '{indian,global}'::text[], '{}'::text[], '{"katori":160}'::jsonb, 164, 9, 27, 2.6, 8, true),
  ('usda', 'USDA FDC kidney beans, cooked', 'Kidney beans (rajma), cooked', 'kidney beans (rajma), cooked', '{indian,global}'::text[], '{}'::text[], '{"katori":160}'::jsonb, 127, 9, 23, 0.5, 7, true),
  ('ifct', 'IFCT 2017 sprouted moong', 'Sprouted moong', 'sprouted moong', '{indian}'::text[], '{}'::text[], '{"katori":100}'::jsonb, 30, 3, 6, 0.2, 1.8, true),
  ('usda', 'USDA FDC white rice, cooked', 'White rice, cooked', 'white rice, cooked', '{indian,global}'::text[], '{}'::text[], '{"katori":150,"cup":158}'::jsonb, 130, 2.7, 28, 0.3, 0.4, true),
  ('usda', 'USDA FDC brown rice, cooked', 'Brown rice, cooked', 'brown rice, cooked', '{global}'::text[], '{}'::text[], '{"katori":150,"cup":195}'::jsonb, 123, 2.7, 26, 1, 1.8, true),
  ('usda', 'USDA FDC basmati rice, cooked', 'Basmati rice, cooked', 'basmati rice, cooked', '{indian}'::text[], '{}'::text[], '{"katori":150}'::jsonb, 121, 3, 25, 0.4, 0.6, true),
  ('ifct', 'IFCT 2017 wheat flour roti', 'Roti (whole wheat)', 'roti (whole wheat)', '{indian}'::text[], '{gluten}'::text[], '{"piece":40}'::jsonb, 297, 10, 46, 7, 5, true),
  ('ifct', 'IFCT 2017 whole wheat flour', 'Whole wheat flour (atta)', 'whole wheat flour (atta)', '{indian}'::text[], '{gluten}'::text[], '{}'::jsonb, 340, 12, 72, 2, 11, true),
  ('usda', 'USDA FDC oats, rolled, dry', 'Rolled oats, dry', 'rolled oats, dry', '{global}'::text[], '{}'::text[], '{"cup":80}'::jsonb, 389, 17, 66, 7, 10, true),
  ('ifct', 'IFCT 2017 poha (flattened rice)', 'Poha (flattened rice), dry', 'poha (flattened rice), dry', '{indian}'::text[], '{}'::text[], '{"cup":50}'::jsonb, 346, 7, 77, 1, 4, true),
  ('usda', 'USDA FDC quinoa, cooked', 'Quinoa, cooked', 'quinoa, cooked', '{global}'::text[], '{}'::text[], '{"cup":185}'::jsonb, 120, 4.4, 21, 1.9, 2.8, true),
  ('usda', 'USDA FDC potato, boiled', 'Potato, boiled', 'potato, boiled', '{global}'::text[], '{}'::text[], '{"medium":150}'::jsonb, 87, 1.9, 20, 0.1, 1.8, true),
  ('usda', 'USDA FDC sweet potato, boiled', 'Sweet potato, boiled', 'sweet potato, boiled', '{global}'::text[], '{}'::text[], '{"medium":130}'::jsonb, 90, 2, 21, 0.1, 3.3, true),
  ('usda', 'USDA FDC bread, white', 'Bread, white', 'bread, white', '{global}'::text[], '{gluten}'::text[], '{"slice":28}'::jsonb, 265, 9, 49, 3, 2.7, true),
  ('usda', 'USDA FDC bread, whole wheat', 'Bread, whole wheat', 'bread, whole wheat', '{global}'::text[], '{gluten}'::text[], '{"slice":32}'::jsonb, 247, 13, 41, 3.4, 7, true),
  ('usda', 'USDA FDC pasta, cooked', 'Pasta, cooked', 'pasta, cooked', '{global}'::text[], '{gluten}'::text[], '{"cup":140}'::jsonb, 158, 6, 31, 0.9, 1.8, true),
  ('ifct', 'IFCT 2017 semolina (suji)', 'Semolina (suji/rava), dry', 'semolina (suji/rava), dry', '{indian}'::text[], '{gluten}'::text[], '{}'::jsonb, 360, 13, 73, 1, 4, true),
  ('ifct', 'IFCT 2017 idli', 'Idli', 'idli', '{indian}'::text[], '{}'::text[], '{"piece":40}'::jsonb, 132, 3, 26, 0.5, 1, true),
  ('ifct', 'IFCT 2017 dosa, plain', 'Dosa, plain', 'dosa, plain', '{indian}'::text[], '{}'::text[], '{"piece":80}'::jsonb, 168, 4, 28, 4, 1, true),
  ('ifct', 'IFCT 2017 bajra (pearl millet)', 'Pearl millet (bajra), dry', 'pearl millet (bajra), dry', '{indian}'::text[], '{}'::text[], '{}'::jsonb, 361, 11, 67, 5, 9, true),
  ('ifct', 'IFCT 2017 ragi (finger millet)', 'Finger millet (ragi), dry', 'finger millet (ragi), dry', '{indian}'::text[], '{}'::text[], '{}'::jsonb, 328, 7, 72, 1.3, 11, true),
  ('usda', 'USDA FDC barley, cooked', 'Barley, cooked', 'barley, cooked', '{global}'::text[], '{gluten}'::text[], '{"cup":157}'::jsonb, 123, 2.3, 28, 0.4, 3.8, true),
  ('usda', 'USDA FDC corn, boiled', 'Corn (maize), boiled', 'corn (maize), boiled', '{global}'::text[], '{}'::text[], '{"cob":90}'::jsonb, 96, 3.4, 21, 1.5, 2.4, true),
  ('ifct', 'IFCT 2017 sabudana (tapioca)', 'Sabudana (tapioca pearls), dry', 'sabudana (tapioca pearls), dry', '{indian}'::text[], '{}'::text[], '{}'::jsonb, 358, 0.2, 94, 0, 1, true),
  ('ifct', 'IFCT 2017 amaranth (rajgira)', 'Amaranth (rajgira), dry', 'amaranth (rajgira), dry', '{indian}'::text[], '{}'::text[], '{}'::jsonb, 371, 14, 65, 7, 7, true),
  ('ifct', 'IFCT 2017 makhana (fox nuts)', 'Makhana (fox nuts)', 'makhana (fox nuts)', '{indian}'::text[], '{}'::text[], '{}'::jsonb, 347, 9.7, 77, 0.1, 7.6, true),
  ('ifct', 'IFCT 2017 besan (gram flour)', 'Besan (gram flour)', 'besan (gram flour)', '{indian}'::text[], '{}'::text[], '{}'::jsonb, 387, 22, 58, 7, 11, true),
  ('usda', 'USDA FDC broccoli, cooked', 'Broccoli, cooked', 'broccoli, cooked', '{global}'::text[], '{}'::text[], '{"cup":156}'::jsonb, 35, 2.4, 7, 0.4, 3.3, true),
  ('usda', 'USDA FDC spinach, cooked', 'Spinach (palak), cooked', 'spinach (palak), cooked', '{indian,global}'::text[], '{}'::text[], '{"katori":150}'::jsonb, 23, 3, 3.8, 0.4, 2.4, true),
  ('usda', 'USDA FDC cauliflower, cooked', 'Cauliflower (gobi), cooked', 'cauliflower (gobi), cooked', '{indian,global}'::text[], '{}'::text[], '{"katori":150}'::jsonb, 23, 1.8, 4, 0.5, 2, true),
  ('usda', 'USDA FDC green beans, cooked', 'Green beans, cooked', 'green beans, cooked', '{global}'::text[], '{}'::text[], '{"katori":150}'::jsonb, 35, 1.9, 8, 0.1, 3.4, true),
  ('usda', 'USDA FDC carrot, raw', 'Carrot, raw', 'carrot, raw', '{global}'::text[], '{}'::text[], '{"medium":60}'::jsonb, 41, 0.9, 10, 0.2, 2.8, true),
  ('usda', 'USDA FDC tomato, raw', 'Tomato, raw', 'tomato, raw', '{global}'::text[], '{}'::text[], '{"medium":120}'::jsonb, 18, 0.9, 3.9, 0.2, 1.2, true),
  ('usda', 'USDA FDC cucumber, raw', 'Cucumber, raw', 'cucumber, raw', '{global}'::text[], '{}'::text[], '{}'::jsonb, 15, 0.7, 3.6, 0.1, 0.5, true),
  ('usda', 'USDA FDC bell pepper, raw', 'Capsicum (bell pepper)', 'capsicum (bell pepper)', '{global}'::text[], '{}'::text[], '{}'::jsonb, 31, 1, 6, 0.3, 2.1, true),
  ('usda', 'USDA FDC mushroom, cooked', 'Mushroom, cooked', 'mushroom, cooked', '{global}'::text[], '{}'::text[], '{"cup":156}'::jsonb, 28, 2.2, 5, 0.5, 2.2, true),
  ('ifct', 'IFCT 2017 okra (bhindi)', 'Okra (bhindi), cooked', 'okra (bhindi), cooked', '{indian}'::text[], '{}'::text[], '{"katori":150}'::jsonb, 33, 1.9, 7, 0.2, 3.2, true),
  ('ifct', 'IFCT 2017 bottle gourd (lauki)', 'Bottle gourd (lauki), cooked', 'bottle gourd (lauki), cooked', '{indian}'::text[], '{}'::text[], '{"katori":150}'::jsonb, 15, 0.6, 3.4, 0.1, 1.2, true),
  ('usda', 'USDA FDC eggplant, cooked', 'Eggplant (brinjal), cooked', 'eggplant (brinjal), cooked', '{indian,global}'::text[], '{}'::text[], '{"katori":150}'::jsonb, 35, 0.8, 9, 0.2, 2.5, true),
  ('usda', 'USDA FDC cabbage, raw', 'Cabbage, raw', 'cabbage, raw', '{global}'::text[], '{}'::text[], '{}'::jsonb, 25, 1.3, 6, 0.1, 2.5, true),
  ('usda', 'USDA FDC onion, raw', 'Onion, raw', 'onion, raw', '{global}'::text[], '{}'::text[], '{"medium":110}'::jsonb, 40, 1.1, 9, 0.1, 1.7, true),
  ('usda', 'USDA FDC peas, cooked', 'Green peas, cooked', 'green peas, cooked', '{global}'::text[], '{}'::text[], '{"katori":150}'::jsonb, 84, 5, 16, 0.4, 5.5, true),
  ('usda', 'USDA FDC pumpkin, cooked', 'Pumpkin, cooked', 'pumpkin, cooked', '{global}'::text[], '{}'::text[], '{"katori":150}'::jsonb, 20, 0.7, 5, 0.1, 1.1, true),
  ('ifct', 'IFCT 2017 fenugreek leaves (methi)', 'Fenugreek leaves (methi)', 'fenugreek leaves (methi)', '{indian}'::text[], '{}'::text[], '{}'::jsonb, 49, 4.4, 6, 0.9, 5, true),
  ('usda', 'USDA FDC beetroot, cooked', 'Beetroot, cooked', 'beetroot, cooked', '{global}'::text[], '{}'::text[], '{}'::jsonb, 44, 1.7, 10, 0.2, 2, true),
  ('usda', 'USDA FDC kimchi', 'Kimchi', 'kimchi', '{east_asian}'::text[], '{}'::text[], '{}'::jsonb, 15, 1.1, 2.4, 0.5, 1.6, true),
  ('usda', 'USDA FDC banana, raw', 'Banana', 'banana', '{global}'::text[], '{}'::text[], '{"medium":118}'::jsonb, 89, 1.1, 23, 0.3, 2.6, true),
  ('usda', 'USDA FDC apple, raw', 'Apple', 'apple', '{global}'::text[], '{}'::text[], '{"medium":182}'::jsonb, 52, 0.3, 14, 0.2, 2.4, true),
  ('usda', 'USDA FDC mango, raw', 'Mango', 'mango', '{indian,global}'::text[], '{}'::text[], '{}'::jsonb, 60, 0.8, 15, 0.4, 1.6, true),
  ('usda', 'USDA FDC orange, raw', 'Orange', 'orange', '{global}'::text[], '{}'::text[], '{"medium":130}'::jsonb, 47, 0.9, 12, 0.1, 2.4, true),
  ('usda', 'USDA FDC papaya, raw', 'Papaya', 'papaya', '{indian,global}'::text[], '{}'::text[], '{}'::jsonb, 43, 0.5, 11, 0.3, 1.7, true),
  ('usda', 'USDA FDC guava, raw', 'Guava', 'guava', '{indian,global}'::text[], '{}'::text[], '{}'::jsonb, 68, 2.6, 14, 1, 5.4, true),
  ('usda', 'USDA FDC grapes, raw', 'Grapes', 'grapes', '{global}'::text[], '{}'::text[], '{}'::jsonb, 69, 0.7, 18, 0.2, 0.9, true),
  ('usda', 'USDA FDC watermelon, raw', 'Watermelon', 'watermelon', '{global}'::text[], '{}'::text[], '{}'::jsonb, 30, 0.6, 8, 0.2, 0.4, true),
  ('usda', 'USDA FDC pomegranate, raw', 'Pomegranate', 'pomegranate', '{indian,global}'::text[], '{}'::text[], '{}'::jsonb, 83, 1.7, 19, 1.2, 4, true),
  ('usda', 'USDA FDC pineapple, raw', 'Pineapple', 'pineapple', '{global}'::text[], '{}'::text[], '{}'::jsonb, 50, 0.5, 13, 0.1, 1.4, true),
  ('usda', 'USDA FDC strawberry, raw', 'Strawberry', 'strawberry', '{global}'::text[], '{}'::text[], '{}'::jsonb, 32, 0.7, 8, 0.3, 2, true),
  ('usda', 'USDA FDC blueberry, raw', 'Blueberry', 'blueberry', '{global}'::text[], '{}'::text[], '{}'::jsonb, 57, 0.7, 14, 0.3, 2.4, true),
  ('usda', 'USDA FDC dates, medjool', 'Dates', 'dates', '{global}'::text[], '{}'::text[], '{"piece":24}'::jsonb, 277, 1.8, 75, 0.2, 7, true),
  ('usda', 'USDA FDC avocado, raw', 'Avocado', 'avocado', '{global}'::text[], '{}'::text[], '{}'::jsonb, 160, 2, 9, 15, 7, true),
  ('usda', 'USDA FDC milk, whole', 'Milk, whole', 'milk, whole', '{global}'::text[], '{dairy}'::text[], '{"cup":244}'::jsonb, 61, 3.2, 4.8, 3.3, 0, true),
  ('usda', 'USDA FDC milk, skim', 'Milk, skim', 'milk, skim', '{global}'::text[], '{dairy}'::text[], '{"cup":245}'::jsonb, 34, 3.4, 5, 0.1, 0, true),
  ('usda', 'USDA FDC yogurt, plain, whole', 'Curd/yogurt (dahi), whole', 'curd/yogurt (dahi), whole', '{indian,global}'::text[], '{dairy}'::text[], '{"katori":150}'::jsonb, 61, 3.5, 4.7, 3.3, 0, true),
  ('usda', 'USDA FDC cheddar cheese', 'Cheese, cheddar', 'cheese, cheddar', '{global}'::text[], '{dairy}'::text[], '{"slice":28}'::jsonb, 402, 25, 1.3, 33, 0, true),
  ('usda', 'USDA FDC butter, salted', 'Butter', 'butter', '{global}'::text[], '{dairy}'::text[], '{"tbsp":14}'::jsonb, 717, 0.9, 0.1, 81, 0, true),
  ('ifct', 'IFCT 2017 ghee', 'Ghee', 'ghee', '{indian}'::text[], '{dairy}'::text[], '{"tbsp":14}'::jsonb, 900, 0, 0, 100, 0, true),
  ('ifct', 'IFCT 2017 buttermilk (chaas)', 'Buttermilk (chaas)', 'buttermilk (chaas)', '{indian}'::text[], '{dairy}'::text[], '{"cup":240}'::jsonb, 40, 3.3, 4.8, 0.9, 0, true),
  ('usda', 'USDA FDC almonds', 'Almonds', 'almonds', '{global}'::text[], '{tree_nut}'::text[], '{"handful":28}'::jsonb, 579, 21, 22, 50, 12, true),
  ('seed', 'almond flour label (per 100 g)', 'Almond flour', 'almond flour', '{global}'::text[], '{tree_nut}'::text[], '{}'::jsonb, 571, 21, 20, 50, 11, true),
  ('usda', 'USDA FDC cashews', 'Cashews', 'cashews', '{global}'::text[], '{tree_nut}'::text[], '{"handful":28}'::jsonb, 553, 18, 30, 44, 3, true),
  ('usda', 'USDA FDC walnuts', 'Walnuts', 'walnuts', '{global}'::text[], '{tree_nut}'::text[], '{"handful":28}'::jsonb, 654, 15, 14, 65, 7, true),
  ('usda', 'USDA FDC pistachios', 'Pistachios', 'pistachios', '{global}'::text[], '{tree_nut}'::text[], '{"handful":28}'::jsonb, 560, 20, 28, 45, 10, true),
  ('usda', 'USDA FDC peanuts', 'Peanuts', 'peanuts', '{global,indian}'::text[], '{peanut}'::text[], '{"handful":28}'::jsonb, 567, 26, 16, 49, 8, true),
  ('usda', 'USDA FDC peanut butter', 'Peanut butter', 'peanut butter', '{global}'::text[], '{peanut}'::text[], '{"tbsp":16}'::jsonb, 588, 25, 20, 50, 6, true),
  ('usda', 'USDA FDC chia seeds', 'Chia seeds', 'chia seeds', '{global}'::text[], '{}'::text[], '{"tbsp":12}'::jsonb, 486, 17, 42, 31, 34, true),
  ('usda', 'USDA FDC flax seeds', 'Flax seeds', 'flax seeds', '{global}'::text[], '{}'::text[], '{"tbsp":10}'::jsonb, 534, 18, 29, 42, 27, true),
  ('usda', 'USDA FDC sunflower seeds', 'Sunflower seeds', 'sunflower seeds', '{global}'::text[], '{}'::text[], '{}'::jsonb, 584, 21, 20, 51, 9, true),
  ('usda', 'USDA FDC pumpkin seeds', 'Pumpkin seeds', 'pumpkin seeds', '{global}'::text[], '{}'::text[], '{}'::jsonb, 559, 30, 11, 49, 6, true),
  ('usda', 'USDA FDC sesame seeds', 'Sesame seeds', 'sesame seeds', '{global,indian}'::text[], '{sesame}'::text[], '{"tbsp":9}'::jsonb, 573, 18, 23, 50, 12, true),
  ('usda', 'USDA FDC coconut, raw', 'Coconut, fresh', 'coconut, fresh', '{indian,global}'::text[], '{coconut}'::text[], '{}'::jsonb, 354, 3.3, 15, 33, 9, true),
  ('usda', 'USDA FDC coconut water', 'Coconut water', 'coconut water', '{indian,global}'::text[], '{coconut}'::text[], '{"cup":240}'::jsonb, 19, 0.7, 3.7, 0.2, 1.1, true),
  ('usda', 'USDA FDC olive oil', 'Olive oil', 'olive oil', '{global}'::text[], '{}'::text[], '{"tbsp":14}'::jsonb, 884, 0, 0, 100, 0, true),
  ('ifct', 'IFCT 2017 mustard oil', 'Mustard oil', 'mustard oil', '{indian}'::text[], '{}'::text[], '{"tbsp":14}'::jsonb, 884, 0, 0, 100, 0, true),
  ('usda', 'USDA FDC coconut oil', 'Coconut oil', 'coconut oil', '{indian,global}'::text[], '{coconut}'::text[], '{"tbsp":14}'::jsonb, 862, 0, 0, 100, 0, true),
  ('usda', 'USDA FDC honey', 'Honey', 'honey', '{global}'::text[], '{}'::text[], '{"tbsp":21}'::jsonb, 304, 0.3, 82, 0, 0.2, true),
  ('ifct', 'IFCT 2017 jaggery (gur)', 'Jaggery (gur)', 'jaggery (gur)', '{indian}'::text[], '{}'::text[], '{}'::jsonb, 383, 0.4, 98, 0.1, 0, true),
  ('usda', 'USDA FDC sugar, granulated', 'Sugar, white', 'sugar, white', '{global}'::text[], '{}'::text[], '{"tsp":4}'::jsonb, 387, 0, 100, 0, 0, true),
  ('usda', 'USDA FDC dark chocolate 70-85%', 'Dark chocolate (70%)', 'dark chocolate (70%)', '{global}'::text[], '{dairy,soy}'::text[], '{}'::jsonb, 598, 8, 46, 43, 11, true),
  ('usda', 'USDA FDC hummus', 'Hummus', 'hummus', '{global}'::text[], '{sesame}'::text[], '{"tbsp":15}'::jsonb, 166, 8, 14, 10, 6, true),
  ('usda', 'USDA FDC green tea, brewed', 'Green tea, brewed', 'green tea, brewed', '{global}'::text[], '{}'::text[], '{"cup":240}'::jsonb, 1, 0, 0.2, 0, 0, true),
  ('usda', 'USDA FDC coffee, black, brewed', 'Coffee, black', 'coffee, black', '{global}'::text[], '{}'::text[], '{"cup":240}'::jsonb, 2, 0.3, 0, 0, 0, true),
  ('usda', 'USDA FDC cornflakes', 'Cornflakes', 'cornflakes', '{global}'::text[], '{}'::text[], '{"cup":28}'::jsonb, 357, 7, 84, 0.4, 3, true),
  ('usda', 'USDA FDC greek yogurt, whole', 'Greek yogurt, whole', 'greek yogurt, whole', '{global}'::text[], '{dairy}'::text[], '{"cup":245}'::jsonb, 97, 9, 4, 5, 0, true),
  ('usda', 'USDA FDC sweet corn, canned', 'Sweet corn, canned', 'sweet corn, canned', '{global}'::text[], '{}'::text[], '{}'::jsonb, 86, 3, 19, 1, 2, true),
  ('usda', 'USDA FDC lettuce, raw', 'Lettuce, raw', 'lettuce, raw', '{global}'::text[], '{}'::text[], '{}'::jsonb, 15, 1.4, 2.9, 0.2, 1.3, true),
  ('usda', 'USDA FDC bottle-gourd equivalent zucchini, cooked', 'Zucchini, cooked', 'zucchini, cooked', '{global}'::text[], '{}'::text[], '{}'::jsonb, 17, 1.2, 3.1, 0.3, 1, true),
  ('ifct', 'IFCT 2017 drumstick (moringa) pods', 'Drumstick (moringa) pods', 'drumstick (moringa) pods', '{indian}'::text[], '{}'::text[], '{}'::jsonb, 37, 2.1, 8.5, 0.2, 3.2, true),
  ('ifct', 'IFCT 2017 curd rice (approx)', 'Bitter gourd (karela), cooked', 'bitter gourd (karela), cooked', '{indian}'::text[], '{}'::text[], '{"katori":150}'::jsonb, 34, 1, 7, 0.2, 2.8, true),
  ('usda', 'USDA FDC cottage cheese full-fat (chhena)', 'Chhena (fresh curd cheese)', 'chhena (fresh curd cheese)', '{indian}'::text[], '{dairy}'::text[], '{}'::jsonb, 200, 18, 4, 13, 0, true),
  ('usda', 'USDA FDC duck egg, boiled', 'Duck egg, boiled', 'duck egg, boiled', '{global}'::text[], '{egg}'::text[], '{"piece":70}'::jsonb, 185, 13, 1.5, 14, 0, true),
  ('usda', 'USDA FDC lamb, lean, cooked', 'Lamb, lean, cooked', 'lamb, lean, cooked', '{global}'::text[], '{}'::text[], '{}'::jsonb, 206, 25, 0, 11, 0, true),
  ('usda', 'USDA FDC tilapia, cooked', 'Tilapia, cooked', 'tilapia, cooked', '{global}'::text[], '{fish}'::text[], '{}'::jsonb, 128, 26, 0, 2.7, 0, true)
on conflict (name_normalized, source) where org_id is null do nothing;
