-- Phase 3.1 — Indian foods seed (GENERATED — do not edit by hand).
-- Source: packages/db/seed/indian-foods-seed.json + food-aliases-seed.json
-- Regenerate: npx tsx packages/db/scripts/gen-foods-migration.ts
--
-- 87 net-new global staples (16 verified single-ingredient,
-- 71 recipe estimates flagged verified=false) + 55 search aliases.
-- allergen_tags are declared ∪ tagger-derived (fail-closed). All macros per 100 g.

insert into public.foods
  (source, source_ref, name, name_normalized, cuisine_tags, allergen_tags, serving_units,
   kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g, verified)
values
  ('ifct', 'IFCT 2017 chana dal, cooked', 'Chana dal (split chickpea), cooked', 'chana dal (split chickpea), cooked', array['indian']::text[], array[]::text[], '{"katori":150}'::jsonb, 120, 7, 20, 1.2, 6, true),
  ('ifct', 'IFCT 2017 whole masoor, cooked', 'Whole masoor (brown lentil), cooked', 'whole masoor (brown lentil), cooked', array['indian']::text[], array[]::text[], '{"katori":150}'::jsonb, 116, 9, 20, 0.4, 8, true),
  ('ifct', 'IFCT 2017 whole moong (green gram), cooked', 'Whole green moong, cooked', 'whole green moong, cooked', array['indian']::text[], array[]::text[], '{"katori":150}'::jsonb, 105, 7, 19, 0.4, 7.6, true),
  ('ifct', 'IFCT 2017 kala chana (black chickpea), cooked', 'Kala chana (black chickpea), cooked', 'kala chana (black chickpea), cooked', array['indian']::text[], array[]::text[], '{"katori":160}'::jsonb, 164, 9, 27, 2.6, 8, true),
  ('ifct', 'IFCT 2017 lobia (black-eyed peas), cooked', 'Lobia (black-eyed peas), cooked', 'lobia (black-eyed peas), cooked', array['indian']::text[], array[]::text[], '{"katori":160}'::jsonb, 116, 8, 21, 0.5, 6.5, true),
  ('ifct', 'IFCT 2017 kulith (horse gram), cooked', 'Horse gram (kulith), cooked', 'horse gram (kulith), cooked', array['indian']::text[], array[]::text[], '{"katori":150}'::jsonb, 122, 9, 20, 0.5, 5, true),
  ('ifct', 'IFCT2017 recipe est. dal tadka', 'Dal tadka', 'dal tadka', array['indian']::text[], array['dairy']::text[], '{"katori":150}'::jsonb, 130, 6, 15, 5, 4, false),
  ('ifct', 'IFCT2017 recipe est. dal makhani', 'Dal makhani', 'dal makhani', array['indian']::text[], array['dairy']::text[], '{"katori":150}'::jsonb, 165, 6, 15, 9, 5, false),
  ('ifct', 'IFCT2017 recipe est. rajma masala', 'Rajma masala', 'rajma masala', array['indian']::text[], array[]::text[], '{"katori":160}'::jsonb, 130, 7, 20, 3, 6, false),
  ('ifct', 'IFCT2017 recipe est. chole (chana masala)', 'Chole (chana masala)', 'chole (chana masala)', array['indian']::text[], array[]::text[], '{"katori":160}'::jsonb, 150, 7, 22, 4, 7, false),
  ('ifct', 'IFCT2017 recipe est. sambar', 'Sambar', 'sambar', array['indian', 'south_indian']::text[], array[]::text[], '{"katori":150}'::jsonb, 85, 4, 12, 2.5, 3, false),
  ('ifct', 'IFCT2017 recipe est. kadhi', 'Kadhi (yogurt curry)', 'kadhi (yogurt curry)', array['indian']::text[], array['dairy']::text[], '{"katori":150}'::jsonb, 110, 4, 9, 6, 1, false),
  ('ifct', 'IFCT2017 recipe est. palak paneer', 'Palak paneer', 'palak paneer', array['indian']::text[], array['dairy']::text[], '{"katori":150}'::jsonb, 150, 8, 6, 11, 3, false),
  ('ifct', 'IFCT2017 recipe est. paneer butter masala', 'Paneer butter masala', 'paneer butter masala', array['indian']::text[], array['dairy', 'tree_nut']::text[], '{"katori":150}'::jsonb, 220, 8, 10, 17, 2, false),
  ('ifct', 'IFCT2017 recipe est. matar paneer', 'Matar paneer', 'matar paneer', array['indian']::text[], array['dairy']::text[], '{"katori":150}'::jsonb, 180, 8, 10, 12, 3, false),
  ('ifct', 'IFCT2017 recipe est. aloo gobi', 'Aloo gobi', 'aloo gobi', array['indian']::text[], array[]::text[], '{"katori":150}'::jsonb, 100, 3, 13, 5, 3, false),
  ('ifct', 'IFCT2017 recipe est. bhindi masala', 'Bhindi masala (okra fry)', 'bhindi masala (okra fry)', array['indian']::text[], array[]::text[], '{"katori":150}'::jsonb, 110, 2, 8, 8, 4, false),
  ('ifct', 'IFCT2017 recipe est. baingan bharta', 'Baingan bharta', 'baingan bharta', array['indian']::text[], array['egg']::text[], '{"katori":150}'::jsonb, 95, 2, 9, 6, 3.5, false),
  ('ifct', 'IFCT2017 recipe est. mixed veg curry', 'Mixed vegetable curry', 'mixed vegetable curry', array['indian']::text[], array[]::text[], '{"katori":150}'::jsonb, 105, 3, 11, 6, 3.5, false),
  ('ifct', 'IFCT2017 recipe est. aloo matar', 'Aloo matar', 'aloo matar', array['indian']::text[], array[]::text[], '{"katori":150}'::jsonb, 110, 3, 15, 5, 3, false),
  ('ifct', 'IFCT2017 recipe est. jeera aloo', 'Jeera aloo', 'jeera aloo', array['indian']::text[], array[]::text[], '{"katori":150}'::jsonb, 130, 2, 20, 5, 2.5, false),
  ('ifct', 'IFCT2017 recipe est. veg pulao', 'Vegetable pulao', 'vegetable pulao', array['indian']::text[], array['dairy']::text[], '{"katori":150}'::jsonb, 150, 3, 25, 4, 1.5, false),
  ('ifct', 'IFCT2017 recipe est. jeera rice', 'Jeera rice', 'jeera rice', array['indian']::text[], array['dairy']::text[], '{"katori":150}'::jsonb, 160, 3, 28, 4, 0.6, false),
  ('ifct', 'IFCT2017 recipe est. lemon rice', 'Lemon rice', 'lemon rice', array['indian', 'south_indian']::text[], array['peanut']::text[], '{"katori":150}'::jsonb, 165, 3, 28, 5, 1, false),
  ('ifct', 'IFCT2017 recipe est. curd rice', 'Curd rice', 'curd rice', array['indian', 'south_indian']::text[], array['dairy']::text[], '{"katori":150}'::jsonb, 120, 4, 20, 3, 0.6, false),
  ('ifct', 'IFCT2017 recipe est. khichdi', 'Moong dal khichdi', 'moong dal khichdi', array['indian']::text[], array['dairy']::text[], '{"katori":150}'::jsonb, 120, 4, 20, 2.5, 2, false),
  ('ifct', 'IFCT2017 recipe est. veg biryani', 'Vegetable biryani', 'vegetable biryani', array['indian']::text[], array['dairy']::text[], '{"katori":180}'::jsonb, 170, 4, 27, 5, 2, false),
  ('ifct', 'IFCT2017 recipe est. plain paratha', 'Paratha (plain)', 'paratha (plain)', array['indian']::text[], array['dairy', 'gluten']::text[], '{"piece":60}'::jsonb, 320, 8, 45, 12, 5, false),
  ('ifct', 'IFCT2017 recipe est. aloo paratha', 'Aloo paratha', 'aloo paratha', array['indian']::text[], array['dairy', 'gluten']::text[], '{"piece":100}'::jsonb, 250, 6, 35, 9, 4, false),
  ('ifct', 'IFCT2017 recipe est. naan', 'Naan', 'naan', array['indian']::text[], array['dairy', 'gluten']::text[], '{"piece":90}'::jsonb, 310, 9, 50, 8, 2, false),
  ('ifct', 'IFCT2017 recipe est. bhatura', 'Bhatura', 'bhatura', array['indian']::text[], array['dairy', 'gluten']::text[], '{"piece":80}'::jsonb, 330, 7, 45, 13, 2, false),
  ('ifct', 'IFCT2017 recipe est. puri', 'Puri (fried)', 'puri (fried)', array['indian']::text[], array['gluten']::text[], '{"piece":25}'::jsonb, 360, 7, 46, 16, 4, false),
  ('ifct', 'IFCT2017 recipe est. thepla', 'Thepla', 'thepla', array['indian']::text[], array['gluten']::text[], '{"piece":40}'::jsonb, 300, 8, 42, 11, 6, false),
  ('ifct', 'IFCT2017 recipe est. missi roti', 'Missi roti', 'missi roti', array['indian']::text[], array['gluten']::text[], '{"piece":50}'::jsonb, 290, 10, 44, 8, 7, false),
  ('ifct', 'IFCT2017 makki roti (maize flatbread)', 'Makki roti', 'makki roti', array['indian']::text[], array['dairy']::text[], '{"piece":50}'::jsonb, 280, 6, 50, 6, 6, false),
  ('ifct', 'IFCT2017 recipe est. masala dosa', 'Masala dosa', 'masala dosa', array['indian', 'south_indian']::text[], array[]::text[], '{"piece":150}'::jsonb, 170, 4, 27, 5, 2, false),
  ('ifct', 'IFCT2017 recipe est. rava dosa', 'Rava dosa', 'rava dosa', array['indian', 'south_indian']::text[], array['gluten']::text[], '{"piece":90}'::jsonb, 200, 4, 30, 7, 1.5, false),
  ('ifct', 'IFCT2017 recipe est. uttapam', 'Uttapam', 'uttapam', array['indian', 'south_indian']::text[], array[]::text[], '{"piece":120}'::jsonb, 150, 4, 26, 3, 2, false),
  ('ifct', 'IFCT2017 recipe est. medu vada', 'Medu vada', 'medu vada', array['indian', 'south_indian']::text[], array[]::text[], '{"piece":45}'::jsonb, 250, 6, 25, 14, 3, false),
  ('ifct', 'IFCT2017 recipe est. upma', 'Upma', 'upma', array['indian', 'south_indian']::text[], array['gluten']::text[], '{"katori":150}'::jsonb, 130, 3, 20, 4, 1.5, false),
  ('ifct', 'IFCT2017 recipe est. ven pongal', 'Ven pongal', 'ven pongal', array['indian', 'south_indian']::text[], array['dairy']::text[], '{"katori":150}'::jsonb, 145, 4, 22, 5, 1.5, false),
  ('ifct', 'IFCT2017 recipe est. rasam', 'Rasam', 'rasam', array['indian', 'south_indian']::text[], array[]::text[], '{"katori":150}'::jsonb, 40, 2, 6, 1, 1, false),
  ('ifct', 'IFCT2017 recipe est. poha, cooked', 'Poha (cooked)', 'poha (cooked)', array['indian']::text[], array['peanut']::text[], '{"katori":150}'::jsonb, 130, 2.5, 25, 3, 1.5, false),
  ('ifct', 'IFCT2017 recipe est. dhokla', 'Dhokla', 'dhokla', array['indian']::text[], array[]::text[], '{"piece":40}'::jsonb, 160, 6, 24, 4, 2, false),
  ('ifct', 'IFCT2017 recipe est. samosa', 'Samosa', 'samosa', array['indian']::text[], array['gluten']::text[], '{"piece":60}'::jsonb, 290, 5, 30, 17, 3, false),
  ('ifct', 'IFCT2017 recipe est. kachori', 'Kachori', 'kachori', array['indian']::text[], array['gluten']::text[], '{"piece":50}'::jsonb, 330, 7, 35, 18, 3, false),
  ('ifct', 'IFCT2017 recipe est. pakora (mixed bhaji)', 'Pakora (mixed vegetable)', 'pakora (mixed vegetable)', array['indian']::text[], array[]::text[], '{"piece":25}'::jsonb, 300, 7, 25, 19, 4, false),
  ('ifct', 'IFCT2017 recipe est. aloo tikki', 'Aloo tikki', 'aloo tikki', array['indian']::text[], array[]::text[], '{"piece":60}'::jsonb, 180, 3, 24, 8, 2.5, false),
  ('ifct', 'IFCT2017 recipe est. pav bhaji', 'Pav bhaji (bhaji only)', 'pav bhaji (bhaji only)', array['indian']::text[], array['dairy']::text[], '{"katori":150}'::jsonb, 130, 3, 15, 7, 4, false),
  ('ifct', 'IFCT2017 pav (bread roll)', 'Pav (bread roll)', 'pav (bread roll)', array['indian']::text[], array['gluten']::text[], '{"piece":45}'::jsonb, 270, 9, 50, 4, 2, false),
  ('ifct', 'IFCT2017 murmura (puffed rice)', 'Puffed rice (murmura)', 'puffed rice (murmura)', array['indian']::text[], array[]::text[], '{"cup":15}'::jsonb, 325, 7, 78, 0.5, 1, true),
  ('ifct', 'IFCT2017 roasted chana (bhuna chana)', 'Roasted chana (bhuna chana)', 'roasted chana (bhuna chana)', array['indian']::text[], array[]::text[], '{"handful":30}'::jsonb, 360, 20, 58, 5, 15, true),
  ('ifct', 'IFCT2017 sev (fried gram-flour)', 'Sev (fried gram flour)', 'sev (fried gram flour)', array['indian']::text[], array[]::text[], '{"handful":20}'::jsonb, 500, 15, 45, 30, 6, false),
  ('ifct', 'IFCT2017 recipe est. bhel puri', 'Bhel puri', 'bhel puri', array['indian']::text[], array['gluten']::text[], '{"katori":100}'::jsonb, 200, 5, 35, 5, 3, false),
  ('ifct', 'IFCT2017 recipe est. gulab jamun', 'Gulab jamun', 'gulab jamun', array['indian']::text[], array['dairy', 'gluten']::text[], '{"piece":40}'::jsonb, 300, 4, 45, 12, 0.5, false),
  ('ifct', 'IFCT2017 recipe est. rasgulla', 'Rasgulla', 'rasgulla', array['indian']::text[], array['dairy']::text[], '{"piece":45}'::jsonb, 180, 4, 38, 1.5, 0, false),
  ('ifct', 'IFCT2017 recipe est. rasmalai', 'Rasmalai', 'rasmalai', array['indian']::text[], array['dairy', 'tree_nut']::text[], '{"piece":60}'::jsonb, 230, 6, 28, 11, 0, false),
  ('ifct', 'IFCT2017 recipe est. jalebi', 'Jalebi', 'jalebi', array['indian']::text[], array['gluten']::text[], '{"piece":25}'::jsonb, 360, 3, 60, 13, 0.5, false),
  ('ifct', 'IFCT2017 recipe est. rice kheer', 'Rice kheer', 'rice kheer', array['indian']::text[], array['dairy', 'tree_nut']::text[], '{"katori":150}'::jsonb, 145, 4, 22, 5, 0.5, false),
  ('ifct', 'IFCT2017 recipe est. gajar halwa', 'Gajar halwa (carrot)', 'gajar halwa (carrot)', array['indian']::text[], array['dairy', 'tree_nut']::text[], '{"katori":120}'::jsonb, 250, 4, 30, 13, 2, false),
  ('ifct', 'IFCT2017 recipe est. sooji halwa', 'Sooji halwa', 'sooji halwa', array['indian']::text[], array['dairy', 'gluten']::text[], '{"katori":120}'::jsonb, 320, 5, 45, 14, 1, false),
  ('ifct', 'IFCT2017 recipe est. besan laddu', 'Besan laddu', 'besan laddu', array['indian']::text[], array['dairy']::text[], '{"piece":30}'::jsonb, 450, 9, 50, 24, 4, false),
  ('ifct', 'IFCT2017 recipe est. kaju katli', 'Kaju katli', 'kaju katli', array['indian']::text[], array['tree_nut']::text[], '{"piece":12}'::jsonb, 460, 10, 55, 22, 2, false),
  ('ifct', 'IFCT2017 recipe est. milk barfi', 'Milk barfi', 'milk barfi', array['indian']::text[], array['dairy']::text[], '{"piece":25}'::jsonb, 400, 8, 50, 18, 0, false),
  ('ifct', 'IFCT2017 recipe est. peanut chikki', 'Peanut chikki', 'peanut chikki', array['indian']::text[], array['peanut']::text[], '{"piece":25}'::jsonb, 470, 15, 50, 24, 4, false),
  ('ifct', 'IFCT2017 recipe est. masala chai with milk', 'Masala chai (with milk & sugar)', 'masala chai (with milk & sugar)', array['indian']::text[], array['dairy']::text[], '{"cup":150}'::jsonb, 65, 2, 9, 2.5, 0, false),
  ('ifct', 'IFCT2017 recipe est. sweet lassi', 'Sweet lassi', 'sweet lassi', array['indian']::text[], array['dairy']::text[], '{"glass":250}'::jsonb, 90, 3, 14, 2.5, 0, false),
  ('ifct', 'IFCT2017 recipe est. mango lassi', 'Mango lassi', 'mango lassi', array['indian']::text[], array['dairy']::text[], '{"glass":250}'::jsonb, 110, 3, 20, 2.5, 0.5, false),
  ('ifct', 'IFCT2017 recipe est. filter coffee with milk', 'Filter coffee (with milk & sugar)', 'filter coffee (with milk & sugar)', array['indian', 'south_indian']::text[], array['dairy']::text[], '{"cup":120}'::jsonb, 60, 2, 8, 2.5, 0, false),
  ('ifct', 'IFCT2017 recipe est. chicken curry', 'Chicken curry (home style)', 'chicken curry (home style)', array['indian']::text[], array[]::text[], '{"katori":150}'::jsonb, 160, 14, 5, 9, 1, false),
  ('ifct', 'IFCT2017 recipe est. butter chicken', 'Butter chicken', 'butter chicken', array['indian']::text[], array['dairy', 'tree_nut']::text[], '{"katori":150}'::jsonb, 210, 14, 7, 14, 1, false),
  ('ifct', 'IFCT2017 recipe est. chicken tikka', 'Chicken tikka (grilled)', 'chicken tikka (grilled)', array['indian']::text[], array['dairy']::text[], '{"piece":30}'::jsonb, 190, 25, 3, 8, 0.5, false),
  ('ifct', 'IFCT2017 recipe est. tandoori chicken', 'Tandoori chicken', 'tandoori chicken', array['indian']::text[], array['dairy']::text[], '{"piece":100}'::jsonb, 175, 25, 2, 8, 0.5, false),
  ('ifct', 'IFCT2017 recipe est. egg curry', 'Egg curry', 'egg curry', array['indian']::text[], array['egg']::text[], '{"katori":150}'::jsonb, 150, 9, 6, 10, 1.5, false),
  ('ifct', 'IFCT2017 recipe est. fish curry', 'Fish curry', 'fish curry', array['indian']::text[], array['coconut', 'fish']::text[], '{"katori":150}'::jsonb, 140, 14, 5, 7, 1, false),
  ('ifct', 'IFCT2017 recipe est. mutton rogan josh', 'Mutton rogan josh', 'mutton rogan josh', array['indian']::text[], array[]::text[], '{"katori":150}'::jsonb, 200, 15, 4, 14, 1, false),
  ('ifct', 'IFCT2017 recipe est. chicken biryani', 'Chicken biryani', 'chicken biryani', array['indian']::text[], array['dairy']::text[], '{"katori":180}'::jsonb, 190, 9, 24, 7, 1.5, false),
  ('ifct', 'IFCT2017 recipe est. prawn masala', 'Prawn masala', 'prawn masala', array['indian']::text[], array['shellfish']::text[], '{"katori":150}'::jsonb, 130, 15, 5, 6, 1, false),
  ('ifct', 'IFCT2017 recipe est. keema (minced meat)', 'Keema (minced mutton)', 'keema (minced mutton)', array['indian']::text[], array[]::text[], '{"katori":150}'::jsonb, 210, 16, 5, 14, 1.5, false),
  ('usda', 'USDA FDC raisins, seedless', 'Raisins (kishmish)', 'raisins (kishmish)', array['indian', 'global']::text[], array[]::text[], '{"handful":30}'::jsonb, 299, 3.1, 79, 0.5, 3.7, true),
  ('usda', 'USDA FDC figs, dried', 'Dried figs (anjeer)', 'dried figs (anjeer)', array['indian', 'global']::text[], array[]::text[], '{"piece":20}'::jsonb, 249, 3.3, 64, 0.9, 9.8, true),
  ('ifct', 'IFCT2017 sapota (chikoo)', 'Chikoo (sapota)', 'chikoo (sapota)', array['indian']::text[], array[]::text[], '{"piece":90}'::jsonb, 83, 0.4, 20, 1.1, 5.3, true),
  ('ifct', 'IFCT2017 custard apple (sitaphal)', 'Custard apple (sitaphal)', 'custard apple (sitaphal)', array['indian']::text[], array[]::text[], '{"piece":150}'::jsonb, 101, 1.7, 25, 0.6, 4.4, true),
  ('ifct', 'IFCT2017 jamun (black plum)', 'Jamun (black plum)', 'jamun (black plum)', array['indian']::text[], array[]::text[], '{"katori":100}'::jsonb, 60, 0.7, 14, 0.2, 0.9, true),
  ('ifct', 'IFCT2017 amla (indian gooseberry)', 'Amla (Indian gooseberry)', 'amla (indian gooseberry)', array['indian']::text[], array[]::text[], '{"piece":40}'::jsonb, 44, 0.9, 10, 0.6, 4.3, true),
  ('ifct', 'IFCT2017 jackfruit, ripe', 'Jackfruit, ripe', 'jackfruit, ripe', array['indian']::text[], array[]::text[], '{"katori":100}'::jsonb, 95, 1.7, 23, 0.6, 1.5, true),
  ('ifct', 'IFCT2017 mosambi (sweet lime), juice', 'Sweet lime (mosambi) juice', 'sweet lime (mosambi) juice', array['indian']::text[], array[]::text[], '{"glass":240}'::jsonb, 43, 0.8, 10, 0.2, 0.2, true)
on conflict (name_normalized, source) where org_id is null do nothing;

-- ── Search aliases (resolved to global foods by name_normalized) ─────────────
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'chawal', 'chawal', 'hi'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'white rice, cooked'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'bhaat', 'bhaat', 'hi'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'white rice, cooked'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'rice', 'rice', 'en'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'white rice, cooked'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'chapati', 'chapati', 'hi'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'roti (whole wheat)'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'chapathi', 'chapathi', 'hi'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'roti (whole wheat)'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'phulka', 'phulka', 'hi'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'roti (whole wheat)'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'atta', 'atta', 'hi'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'whole wheat flour (atta)'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'toor dal', 'toor dal', 'in'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'pigeon pea (toor dal), cooked'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'arhar dal', 'arhar dal', 'in'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'pigeon pea (toor dal), cooked'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'masoor dal', 'masoor dal', 'in'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'red lentils (masoor dal), cooked'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'moong dal', 'moong dal', 'in'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'moong dal, cooked'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'urad dal', 'urad dal', 'in'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'black gram (urad dal), cooked'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'chana dal', 'chana dal', 'in'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'chana dal (split chickpea), cooked'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'chhole', 'chhole', 'in'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'chole (chana masala)'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'chole', 'chole', 'in'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'chole (chana masala)'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'chana', 'chana', 'in'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'chickpeas (chana), cooked'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'kabuli chana', 'kabuli chana', 'in'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'chickpeas (chana), cooked'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'rajma', 'rajma', 'in'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'kidney beans (rajma), cooked'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'lobia', 'lobia', 'in'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'lobia (black-eyed peas), cooked'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'anda', 'anda', 'hi'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'egg, whole, boiled'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'doodh', 'doodh', 'hi'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'milk, whole'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'milk', 'milk', 'en'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'milk, whole'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'dahi', 'dahi', 'hi'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'curd/yogurt (dahi), whole'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'curd', 'curd', 'en'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'curd/yogurt (dahi), whole'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'aloo', 'aloo', 'hi'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'potato, boiled'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'aalu', 'aalu', 'hi'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'potato, boiled'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'pyaaz', 'pyaaz', 'hi'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'onion, raw'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'pyaz', 'pyaz', 'hi'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'onion, raw'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'tamatar', 'tamatar', 'hi'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'tomato, raw'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'gajar', 'gajar', 'hi'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'carrot, raw'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'kela', 'kela', 'hi'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'banana'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'seb', 'seb', 'hi'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'apple'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'aam', 'aam', 'hi'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'mango'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'palak', 'palak', 'hi'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'spinach (palak), cooked'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'gobi', 'gobi', 'hi'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'cauliflower (gobi), cooked'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'bhindi', 'bhindi', 'hi'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'okra (bhindi), cooked'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'lauki', 'lauki', 'hi'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'bottle gourd (lauki), cooked'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'baingan', 'baingan', 'hi'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'eggplant (brinjal), cooked'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'brinjal', 'brinjal', 'en'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'eggplant (brinjal), cooked'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'karela', 'karela', 'hi'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'bitter gourd (karela), cooked'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'methi', 'methi', 'hi'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'fenugreek leaves (methi)'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'chai', 'chai', 'in'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'masala chai (with milk & sugar)'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'tea', 'tea', 'en'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'masala chai (with milk & sugar)'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'murmura', 'murmura', 'in'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'puffed rice (murmura)'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'makki di roti', 'makki di roti', 'pa'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'makki roti'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'makke di roti', 'makke di roti', 'pa'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'makki roti'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'besan laddoo', 'besan laddoo', 'in'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'besan laddu'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'kaju barfi', 'kaju barfi', 'in'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'kaju katli'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'ghee rice', 'ghee rice', 'in'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'jeera rice'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'dahi chawal', 'dahi chawal', 'in'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'curd rice'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'chikki', 'chikki', 'in'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'peanut chikki'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'kishmish', 'kishmish', 'hi'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'raisins (kishmish)'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'anjeer', 'anjeer', 'hi'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'dried figs (anjeer)'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'sitaphal', 'sitaphal', 'hi'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'custard apple (sitaphal)'
  on conflict do nothing;
  insert into public.food_aliases (food_id, alias, alias_normalized, locale)
  select f.id, 'chikoo', 'chikoo', 'hi'
  from public.foods f
  where f.org_id is null and f.name_normalized = 'chikoo (sapota)'
  on conflict do nothing;
