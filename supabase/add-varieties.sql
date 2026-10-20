-- ============================================================
-- AJR — add product VARIETIES + product IMAGE storage
-- Run once in Supabase → SQL Editor → New query → Run
-- ============================================================

-- 1. Per-kg variety list for each product: [{ "name": "Cashew W240", "price": 1100 }]
alter table public.products
  add column if not exists varieties jsonb not null default '[]'::jsonb;

-- 2. Public bucket the admin dashboard uploads product images into.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

drop policy if exists "Public read product images" on storage.objects;
create policy "Public read product images"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-images');

-- 3. Re-sync the products id sequence (needed because rows were seeded with explicit ids,
--    which leaves the auto-increment counter behind and makes new inserts collide).
select setval(
  pg_get_serial_sequence('public.products', 'id'),
  (select coalesce(max(id), 1) from public.products)
);

-- Done. Products added/edited from the admin dashboard now persist
-- their varieties (with per-kg prices) and uploaded images.
