-- ============================================================
-- AJR — per-product PACK SIZES + the current price list
-- Run once in Supabase → SQL Editor → New query → Run
-- (idempotent — safe to run more than once)
-- ============================================================
--
-- Prices in this file are PER KILOGRAM (₹ / kg), exactly as the shop prices them.
-- `varieties` holds the per-kg price of each grade; `price` holds the derived
-- 250 g price so older screens that read `price` still agree.
-- `pack_sizes` is the gram dropdown each product offers.
--
-- Stock and status are deliberately NOT overwritten for existing rows — only the
-- catalogue fields (name, price, varieties, pack sizes, image, description …).

-- ------------------------------------------------------------
-- 1. The pack-size column. Empty array = the shop falls back to its
--    per-category defaults (spices 50/100/250/500 g, everything else 250/500/1 kg).
-- ------------------------------------------------------------
alter table public.products
  add column if not exists pack_sizes text[] not null default '{}'::text[];

-- ------------------------------------------------------------
-- 2. The catalogue + price list.
-- ------------------------------------------------------------
insert into public.products
  (id, name, type, category, price, stock, status, image, detail, rating, reviews_count, origin, nutrients, varieties, pack_sizes, active)
values

-- ===== Nuts — 100 g / 250 g / 500 g =====
  (1, 'Almonds', 'Almonds', 'Almonds', 300, 20, 'In stock', '/almonds.webp',
   'Whole California almonds — plain, blanched or dry-roasted — with a clean, buttery crunch.',
   4.9, 128, 'California, USA', array['Vitamin E','Plant Protein','Magnesium'],
   '[{"name":"Almonds","price":1200},{"name":"Blanched Almonds","price":1600},{"name":"Roasted Almonds","price":1500}]'::jsonb,
   array['100 g','250 g','500 g'], true),
  (2, 'Cashews', 'Cashews', 'Cashews', 350, 100, 'In stock', '/cashews.jpg',
   'Creamy whole cashews in W180, W240, W320 and split grades, roasted to order.',
   5.0, 94, 'Mangalore, India', array['Healthy Fats','Zinc','Copper'],
   '[{"name":"Cashew W180","price":1400},{"name":"Cashew W240","price":1100},{"name":"Cashew W320","price":1000},{"name":"Cashew Jumbo Splits","price":1100},{"name":"Cashew Splits","price":1000},{"name":"Roasted Cashews","price":1400},{"name":"Chilli Cashews","price":1400},{"name":"Pepper Cashews","price":1400},{"name":"Salted Cashews","price":1400},{"name":"BBQ Cashews","price":1400},{"name":"Chilli Garlic Cashews","price":1400},{"name":"Cheese Cashews","price":1400},{"name":"Tangy Tomato Cashews","price":1400},{"name":"Mint Cashews","price":1400},{"name":"Peri Peri Cashews","price":1400}]'::jsonb,
   array['100 g','250 g','500 g'], true),
  (3, 'Pistachios', 'Pistachios', 'Pistachios', 450, 80, 'In stock', '/pistachios.jpg',
   'Premium pistachios with a vivid green kernel and exceptional crunch — salted or plain.',
   4.8, 156, 'Kerman, Iran', array['Protein','Lutein','Potassium'],
   '[{"name":"Salted Pistachios","price":1800},{"name":"Plain Pistachios","price":3000}]'::jsonb,
   '{}', true),

-- ===== Walnuts — 100 g / 250 g / 500 g / 1 kg =====
  (4, 'Walnuts', 'Walnuts', 'Walnuts', 350, 45, 'In stock', '/walnuts.jpg',
   'Hand-broken snow-white walnut halves with zero bitterness and a naturally buttery bite — Kashmiri and Chilean grades.',
   4.9, 82, 'Kashmir, India', array['Omega-3 (ALA)','Polyphenols','B-Vitamins'],
   '[{"name":"Kashmiri Walnut","price":1400},{"name":"Chilean Walnut","price":1900}]'::jsonb,
   array['100 g','250 g','500 g','1 kg'], true),

-- ===== Dried fruit — 100 g / 250 g / 500 g =====
  (5, 'Dried Blueberries', 'Berries', 'Berries', 425, 75, 'In stock', '/dried-blueberries.jpg',
   'Sweet-tart whole dried blueberries packed with antioxidants and natural fruit sugars.',
   4.9, 128, 'California, USA', array['Antioxidants','Vitamin C','Fiber'],
   '[{"name":"Dried Blueberries","price":1700}]'::jsonb, array['100 g','250 g','500 g'], true),
  (6, 'Dried Cranberries', 'Berries', 'Berries', 188, 80, 'In stock', '/dried-cranberries.jpg',
   'Plump dried cranberries with a bright, tangy bite — perfect for snacking and bakes.',
   5.0, 94, 'Wisconsin, USA', array['Vitamin C','Fiber','Antioxidants'],
   '[{"name":"Dried Cranberries","price":750}]'::jsonb, array['100 g','250 g','500 g'], true),
  (7, 'Dried Kiwi', 'Tropical Fruit', 'Tropical Fruit', 150, 65, 'In stock', '/dried-kiwi.jpeg',
   'Tangy-sweet dried kiwi slices, slow-dried to keep their vivid colour and vitamin C.',
   4.8, 156, 'New Zealand', array['Vitamin C','Fiber','Potassium'],
   '[{"name":"Dried Kiwi","price":600}]'::jsonb, array['100 g','250 g','500 g'], true),
  (8, 'Dried Apricots', 'Stone Fruit', 'Stone Fruit', 349, 90, 'In stock', '/dried-apricots.png',
   'Soft, naturally sweet sun-dried apricot halves with a rich golden flavour.',
   4.9, 82, 'Ladakh, India', array['Vitamin A','Iron','Fiber'],
   '[]'::jsonb, '{}', true),
  (15, 'Dried Mango', 'Tropical Fruit', 'Tropical Fruit', 175, 90, 'In stock', '/dried-mango.jpg',
   'Alphonso mango slices dried at low heat to keep their vivid colour and rich, honeyed tropical flavour.',
   4.9, 142, 'Ratnagiri, India', array['Vitamin A','Vitamin C','Dietary Fiber'],
   '[{"name":"Dried Mango","price":700}]'::jsonb, array['100 g','250 g','500 g'], true),
  (16, 'Dried Strawberry', 'Berries', 'Berries', 225, 70, 'In stock', '/dried-strawberry.jpg',
   'Whole strawberries dried to an intense sweet-tart chew, packed with antioxidants and natural fruit sugars.',
   4.7, 88, 'Maharashtra, India', array['Vitamin C','Antioxidants','Folate'],
   '[{"name":"Dried Strawberry","price":900}]'::jsonb, array['100 g','250 g','500 g'], true),

-- ===== Seeds — 50 g / 100 g / 250 g =====
  (18, 'Premium Chia Seeds', 'Seeds', 'Seeds', 125, 140, 'In stock', '/chia-seeds.jpg',
   'Omega-3 rich chia seeds that gel beautifully in water, ideal for puddings, smoothies and everyday fibre.',
   4.9, 164, 'Bolivia', array['Omega-3 (ALA)','Dietary Fiber','Calcium'],
   '[{"name":"Premium Chia Seeds","price":500}]'::jsonb, array['50 g','100 g','250 g'], true),
  (19, 'Golden Flax Seeds', 'Seeds', 'Seeds', 50, 130, 'In stock', '/flax-seeds.jpg',
   'Cold-cleaned flax seeds with a nutty finish, a plant-based powerhouse of ALA omega-3 and lignans.',
   4.8, 118, 'Madhya Pradesh, India', array['Omega-3 (ALA)','Lignans','Magnesium'],
   '[{"name":"Golden Flax Seeds","price":200}]'::jsonb, array['50 g','100 g','250 g'], true),
  (20, 'Green Pumpkin Seeds', 'Seeds', 'Seeds', 175, 110, 'In stock', '/dried-pumpkin-seeds.png',
   'Plump, hulled pumpkin seeds (pepitas) with a buttery crunch and a generous dose of magnesium and zinc.',
   4.9, 137, 'Austria', array['Magnesium','Zinc','Plant Protein'],
   '[{"name":"Green Pumpkin Seeds","price":700}]'::jsonb, array['50 g','100 g','250 g'], true),
  (21, 'Sunflower Seeds', 'Seeds', 'Seeds', 100, 150, 'In stock', '/sunflower-seeds.jpg',
   'Jumbo sunflower kernels, lightly roasted for a mellow nutty flavour and a satisfying everyday crunch.',
   4.7, 102, 'Karnataka, India', array['Vitamin E','Selenium','Plant Protein'],
   '[{"name":"Sunflower Seeds","price":400}]'::jsonb, array['50 g','100 g','250 g'], true),
  (22, 'Watermelon Seeds', 'Seeds', 'Seeds', 219, 95, 'In stock', '/watermelon-seeds.jpg',
   'Hand-sorted watermelon seeds with a delicate, mildly sweet kernel, a traditional source of iron and protein.',
   4.6, 68, 'Rajasthan, India', array['Iron','Protein','Magnesium'],
   '[]'::jsonb, '{}', true),
  (23, 'White Sesame Seeds', 'Seeds', 'Seeds', 100, 160, 'In stock', '/sesame-white-seeds.jpg',
   'Hulled white sesame seeds with a clean, delicately nutty taste, rich in calcium and healthy fats.',
   4.8, 91, 'Gujarat, India', array['Calcium','Healthy Fats','Copper'],
   '[{"name":"White Sesame Seeds","price":400}]'::jsonb, array['50 g','100 g','250 g'], true),
  (24, 'Black Sesame Seeds', 'Seeds', 'Seeds', 90, 120, 'In stock', '/sesame-black-seeds.jpg',
   'Bold black sesame seeds with a deep roasted aroma, prized in Asian cooking and traditional wellness.',
   4.8, 77, 'Gujarat, India', array['Calcium','Iron','Antioxidants'],
   '[{"name":"Black Sesame Seeds","price":360}]'::jsonb, array['50 g','100 g','250 g'], true),
  (25, 'Basil Seeds (Sabja)', 'Seeds', 'Seeds', 113, 105, 'In stock', '/basil-seeds.jpg',
   'Sabja basil seeds that swell into a cooling gel in seconds, a natural way to stay hydrated and refreshed.',
   4.9, 125, 'Tamil Nadu, India', array['Dietary Fiber','Omega-3','Cooling'],
   '[{"name":"Sabja Seeds","price":450}]'::jsonb, array['50 g','100 g','250 g'], true),
  (26, 'Poppy Seeds', 'Seeds', 'Seeds', 239, 88, 'In stock', '/poppy-seeds.jpg',
   'Creamy white poppy seeds with a gentle nutty sweetness, a classic finish for curries, bakes and breads.',
   4.7, 59, 'Madhya Pradesh, India', array['Calcium','Magnesium','Healthy Fats'],
   '[]'::jsonb, '{}', true),
  (44, 'Melon Seeds', 'Seeds', 'Seeds', 225, 70, 'In stock', '/dried-pumpkin-seeds.png',
   'Creamy muskmelon seed kernels, hand-sorted and hulled, for a mild, milky crunch in snacks and sweets.',
   4.8, 64, 'Rajasthan, India', array['Plant Protein','Magnesium','Healthy Fats'],
   '[{"name":"Melon Seeds","price":900}]'::jsonb, array['50 g','100 g','250 g'], true),
  (45, 'Cucumber Seeds', 'Seeds', 'Seeds', 125, 65, 'In stock', '/watermelon-seeds.jpg',
   'Pale cucumber seed kernels with a soft, nutty bite — a cooling traditional snack in regular and bold grades.',
   4.7, 46, 'Karnataka, India', array['Plant Protein','Iron','Healthy Fats'],
   '[{"name":"Cucumber Seeds","price":500},{"name":"Cucumber Seeds Bold","price":900}]'::jsonb,
   array['50 g','100 g','250 g'], true),
  (46, 'Halim Seeds', 'Seeds', 'Seeds', 125, 60, 'In stock', '/mustard.webp',
   'Garden cress (halim/aliv) seeds that swell into a gel, traditionally eaten for iron and everyday strength.',
   4.7, 52, 'Rajasthan, India', array['Iron','Dietary Fiber','Plant Protein'],
   '[{"name":"Halim Seeds","price":500}]'::jsonb, array['50 g','100 g','250 g'], true),
  (47, 'Almond Gum (Badam Pisin)', 'Seeds', 'Seeds', 175, 55, 'In stock', '/dried-pineapple.jpg',
   'Amber almond gum crystals that bloom into a cooling jelly — the classic badam pisin for summer drinks.',
   4.8, 58, 'Tamil Nadu, India', array['Dietary Fiber','Cooling','Plant Based'],
   '[{"name":"Almond Gum (Badam Pisin)","price":700}]'::jsonb, array['50 g','100 g','250 g'], true),

-- ===== Remaining dried fruit (prices unchanged) =====
  (9, 'Figs', 'Figs', 'Figs', 250, 70, 'In stock', '/afghan-figs.webp',
   'Naturally sun-dried figs with a sweet chew and crunchy seeds — regular and bold grades.',
   4.9, 110, 'Kandahar, Afghanistan', array['Dietary Fiber','Calcium','Iron'],
   '[{"name":"Figs","price":1000},{"name":"Figs Bold","price":1600}]'::jsonb, '{}', true),
  (10, 'Raisins', 'Raisins', 'Raisins', 125, 120, 'In stock', '/golden-raisins.jpg',
   'Plump, naturally sun-dried raisins — golden Narthol and sweet black — in clean, seedless clusters.',
   4.7, 73, 'Nashik, India', array['Iron','Calcium','Dietary Fiber'],
   '[{"name":"Narthol Raisins","price":500},{"name":"Black Raisins","price":600}]'::jsonb, '{}', true),
  (12, 'Dates', 'Dates', 'Dates', 50, 100, 'In stock', '/dates.jpg',
   'Naturally sweet dates — wet, deseeded, Mebroom and Medjool — soft, caramel-like and full of fiber.',
   5.0, 64, 'Saudi Arabia', array['Natural Fiber','Potassium','Antioxidants'],
   '[{"name":"Wet Dates","price":200},{"name":"Deseeded Wet Dates","price":300},{"name":"Mebroom Dates","price":950},{"name":"Medjool Dates","price":1900}]'::jsonb,
   '{}', true),
  (13, 'Premium Dried Prunes', 'Prunes', 'Prunes', 329, 70, 'In stock', '/dried-prunes.jpg',
   'Soft, naturally sweet dried plums with a deep caramel bite — a rich source of fibre and potassium for everyday gut-friendly snacking.',
   4.8, 88, 'California, USA', array['Dietary Fiber','Potassium','Vitamin K'],
   '[]'::jsonb, '{}', true),
  (14, 'Dried Pineapple', 'Tropical Fruit', 'Tropical Fruit', 249, 85, 'In stock', '/dried-pineapple.jpg',
   'Golden rings of sun-ripened pineapple, slow-dried to a chewy, tangy-sweet bite with zero added sugar.',
   4.8, 96, 'Kerala, India', array['Vitamin C','Manganese','Bromelain'],
   '[]'::jsonb, '{}', true),
  (17, 'Dried Cherry', 'Stone Fruit', 'Stone Fruit', 349, 60, 'In stock', '/dried-cherry.jpg',
   'Deep ruby dried cherries with a bold sweet-tart punch, perfect for desserts, granola and cheese boards.',
   4.8, 74, 'Turkey', array['Anthocyanins','Potassium','Vitamin A'],
   '[]'::jsonb, '{}', true),

-- ===== Whole spices — 25 g / 50 g / 100 g =====
  (29, 'Mace', 'Spices', 'Spices', 1000, 30, 'In stock', '/mace.jpg',
   'Delicate amber mace blades with a warm, floral character for biryanis, pulaos and festive dishes.',
   4.8, 37, 'Kerala, India', array['Whole Spice','Warm Aroma','Festive Essential'],
   '[{"name":"Mace","price":4000}]'::jsonb, array['25 g','50 g','100 g'], true),
  (30, 'Nutmeg', 'Spices', 'Spices', 375, 40, 'In stock', '/nutmeg.webp',
   'Whole nutmeg with a sweet, woody fragrance that adds depth to bakes, desserts and savoury dishes.',
   4.8, 42, 'Kerala, India', array['Whole Spice','Sweet Aroma','Baking Essential'],
   '[{"name":"Nutmeg","price":1500}]'::jsonb, array['25 g','50 g','100 g'], true),
  (31, 'Star Anise', 'Spices', 'Spices', 300, 45, 'In stock', '/star-anise.jpg',
   'Beautiful whole star anise with a naturally sweet licorice note for teas, broths and spice blends.',
   4.7, 35, 'Tamil Nadu, India', array['Whole Spice','Sweet Aroma','Tea Essential'],
   '[{"name":"Star Anise","price":1200}]'::jsonb, array['25 g','50 g','100 g'], true),
  (32, 'Cassia', 'Spices', 'Spices', 100, 60, 'In stock', '/cassia.webp',
   'Robust cassia bark with a warm, sweet-spiced profile for chai, curries, rice dishes and desserts.',
   4.7, 44, 'Kerala, India', array['Whole Spice','Warm Aroma','Chai Essential'],
   '[{"name":"Cassia","price":400}]'::jsonb, array['25 g','50 g','100 g'], true),
  (33, 'Cinnamon', 'Spices', 'Spices', 500, 50, 'In stock', '/cinnamon.jpg',
   'Fragrant cinnamon quills with a mellow sweetness, ready for chai, baking and slow-cooked recipes.',
   4.9, 71, 'Sri Lanka', array['Whole Spice','Sweet Aroma','Pantry Essential'],
   '[{"name":"Cinnamon","price":2000}]'::jsonb, array['25 g','50 g','100 g'], true),
  (34, 'Cloves', 'Spices', 'Spices', 400, 55, 'In stock', '/cloves.webp',
   'Plump whole cloves with an intense, warming aroma for masalas, curries, chai and festive bakes.',
   4.8, 63, 'Tamil Nadu, India', array['Whole Spice','Warm Aroma','Masala Essential'],
   '[{"name":"Cloves","price":1600}]'::jsonb, array['25 g','50 g','100 g'], true),
  (42, 'Stone Flower (Dagad Phool)', 'Spices', 'Spices', 250, 35, 'In stock', '/cassia.webp',
   'Kalpasi stone flower with a deep, earthy-woodsy aroma — the secret note in Chettinad and Kolhapuri masalas.',
   4.7, 29, 'Tamil Nadu, India', array['Whole Spice','Earthy Aroma','Masala Essential'],
   '[{"name":"Stone Flower","price":1000}]'::jsonb, array['25 g','50 g','100 g'], true),
  (43, 'Birinji Leaves', 'Spices', 'Spices', 100, 35, 'In stock', '/mace.jpg',
   'Dried birinji leaves with a warm, herbal fragrance, used whole to perfume biryanis, pulaos and kurmas.',
   4.7, 26, 'Tamil Nadu, India', array['Whole Spice','Herbal Aroma','Biryani Essential'],
   '[{"name":"Birinji Leaves","price":400}]'::jsonb, array['25 g','50 g','100 g'], true),

-- ===== Pepper & cardamom grades — 25 g / 50 g / 100 g / 250 g =====
  (28, 'Black Pepper', 'Spices', 'Spices', 200, 60, 'In stock', '/black-pepper.jpg',
   'Bold, sun-dried black peppercorns in small, medium and bold grades, selected for deep aroma and warmth.',
   4.9, 86, 'Kerala, India', array['Whole Spice','Pungent Aroma','Kitchen Essential'],
   '[{"name":"Pepper Small","price":800},{"name":"Pepper Medium","price":900},{"name":"Pepper Bold","price":1000}]'::jsonb,
   array['25 g','50 g','100 g','250 g'], true),
  (35, 'Cardamom', 'Spices', 'Spices', 1125, 40, 'In stock', '/cardamom.webp',
   'Vibrant green cardamom pods with a sweet, cooling fragrance — 7 mm bold and 8 mm jumbo grades.',
   4.9, 92, 'Kerala, India', array['Whole Spice','Fresh Aroma','Chai Essential'],
   '[{"name":"Cardamom 7mm (Bold)","price":4500},{"name":"Cardamom 8mm (Jumbo)","price":5000}]'::jsonb,
   array['25 g','50 g','100 g','250 g'], true),

-- ===== Pantry spices — 50 g / 100 g / 250 g / 500 g =====
  (38, 'Mustard', 'Spices', 'Spices', 40, 70, 'In stock', '/mustard.webp',
   'Whole mustard seeds with a sharp, earthy character for tempering, pickles, curries and homemade sauces.',
   4.7, 41, 'Gujarat, India', array['Whole Spice','Robust Aroma','Tempering Essential'],
   '[{"name":"Mustard","price":160}]'::jsonb, array['50 g','100 g','250 g','500 g'], true),
  (39, 'Fenugreek', 'Spices', 'Spices', 75, 70, 'In stock', '/fenugreek.avif',
   'Golden fenugreek seeds with a pleasantly bitter, maple-like note for curries, pickles and spice blends.',
   4.7, 32, 'Rajasthan, India', array['Whole Spice','Toasty Aroma','Pantry Essential'],
   '[{"name":"Fenugreek","price":300}]'::jsonb, array['50 g','100 g','250 g','500 g'], true),
  (40, 'Fennel Seeds', 'Spices', 'Spices', 40, 75, 'In stock', '/fennel.webp',
   'Sweet, bright green fennel seeds selected for a refreshing finish in teas, desserts and savoury cooking.',
   4.8, 55, 'Gujarat, India', array['Whole Spice','Sweet Aroma','Tea Essential'],
   '[{"name":"Fennel Seeds","price":160}]'::jsonb, array['50 g','100 g','250 g','500 g'], true),
  (41, 'Cumin (Jeera)', 'Spices', 'Spices', 100, 70, 'In stock', '/cumin.webp',
   'Aromatic whole cumin with a warm, earthy flavour for curries, dals, rice and everyday masala blends.',
   4.9, 68, 'Rajasthan, India', array['Whole Spice','Warm Aroma','Masala Essential'],
   '[{"name":"Cumin (Jeera)","price":400}]'::jsonb, array['50 g','100 g','250 g','500 g'], true),
  (27, 'White Pepper', 'Spices', 'Spices', 349, 45, 'In stock', '/white-pepper.jpg',
   'Clean, aromatic white peppercorns with a bright, gentle heat for creamy sauces, soups and delicate curries.',
   4.8, 48, 'Kerala, India', array['Whole Spice','Fresh Aroma','Kitchen Essential'],
   '[]'::jsonb, '{}', true),
  (36, 'Carom (Ajwain)', 'Spices', 'Spices', 149, 50, 'In stock', '/carom-ajwain.jpg',
   'Fragrant whole ajwain with its signature warm, thyme-like aroma for breads, snacks and everyday tempering.',
   4.8, 39, 'Rajasthan, India', array['Whole Spice','Fresh Aroma','Pantry Essential'],
   '[]'::jsonb, '{}', true),
  (37, 'Nigella (Kalonji)', 'Spices', 'Spices', 169, 50, 'In stock', '/nigella-kalonji.jpg',
   'Clean nigella seeds with a lightly peppery, onion-like flavour for pickles, breads and vegetable dishes.',
   4.8, 34, 'Rajasthan, India', array['Whole Spice','Bold Aroma','Kitchen Essential'],
   '[]'::jsonb, '{}', true)

-- Stock and status are left as-is on existing rows; every other catalogue field
-- is refreshed so the shop, the admin console and the price list all agree.
on conflict (id) do update set
  name          = excluded.name,
  type          = excluded.type,
  category      = excluded.category,
  price         = excluded.price,
  image         = excluded.image,
  detail        = excluded.detail,
  rating        = excluded.rating,
  reviews_count = excluded.reviews_count,
  origin        = excluded.origin,
  nutrients     = excluded.nutrients,
  varieties     = excluded.varieties,
  pack_sizes    = excluded.pack_sizes,
  updated_at    = now();

-- ------------------------------------------------------------
-- 3. Re-sync the products id sequence (rows were seeded with explicit ids,
--    which leaves the auto-increment counter behind).
-- ------------------------------------------------------------
select setval(
  pg_get_serial_sequence('public.products', 'id'),
  (select coalesce(max(id), 1) from public.products)
);

-- ------------------------------------------------------------
-- 4. Verify — check the per-kg price and the gram dropdown for every product.
-- ------------------------------------------------------------
select
  id,
  name,
  type,
  price                                 as price_250g,
  (varieties -> 0 ->> 'price')::numeric as per_kg,
  array_to_string(pack_sizes, ' / ')    as gram_dropdown,
  jsonb_array_length(varieties)         as varieties
from public.products
order by id;
