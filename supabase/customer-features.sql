-- ============================================================
-- AJR — customer shopping: carts, wishlists, order ownership
-- Run once in Supabase → SQL Editor → New query → Run
-- (idempotent — safe to run more than once)
-- ============================================================

-- 1. Attach every order to the customer who placed it, plus payment details.
alter table public.orders add column if not exists user_id uuid;
alter table public.orders add column if not exists payment_method text not null default 'COD';
alter table public.orders add column if not exists payment_status text not null default 'Pending';
alter table public.orders add column if not exists idempotency_key text;
alter table public.orders add column if not exists updated_at timestamptz not null default now();

create index if not exists orders_user_id_idx on public.orders (user_id, created_at desc);
create unique index if not exists orders_idempotency_key_key
  on public.orders (idempotency_key)
  where idempotency_key is not null;

-- 2. Per-customer cart. One row per user holding the cart lines as JSON.
create table if not exists public.carts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- 3. Per-customer wishlist. One row per user holding the saved products as JSON.
create table if not exists public.wishlists (
  user_id uuid primary key references auth.users (id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- 4. Lock the new tables down: NO policies for anon/authenticated.
--    Only the service-role client inside app/api/* can read or write them,
--    and every route scopes the query by the authenticated user's id.
alter table public.carts enable row level security;
alter table public.wishlists enable row level security;

-- 5. Lock orders down as well.
--    The original schema let ANY anon key select/insert/update/delete EVERY order
--    directly through PostgREST, which would leak one customer's data to another.
--    The app only ever touches orders through /api/* (service role), so these
--    anon policies can be removed without breaking the admin panel or the shop.
drop policy if exists "Allow checkout inserts" on public.orders;
drop policy if exists "Allow reading orders" on public.orders;
drop policy if exists "Allow order updates" on public.orders;
drop policy if exists "Allow order deletes" on public.orders;

-- 6. Status values the admin can set and the customer sees in My Orders.
--    (Applied by the API — kept here as documentation of the allowed set.)
--    Pending | Order Placed | Confirmed | Processing | Packed | Shipped
--    | Out for delivery | Delivered | Cancelled | Paid

-- ============================================================
-- Verify — every row below should return true.
-- ============================================================
select
  to_regclass('public.carts')     is not null as carts_exists,
  to_regclass('public.wishlists') is not null as wishlists_exists,
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'orders'
            and column_name = 'user_id')                 as orders_has_user_id,
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'orders'
            and column_name = 'payment_method')          as orders_has_payment_method,
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'orders'
            and column_name = 'idempotency_key')         as orders_has_idempotency_key;
