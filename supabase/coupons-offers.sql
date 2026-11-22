-- AJR coupons and offers. Apply after schema.sql and customer-features.sql.
-- No coupon or redemption data is seeded.
-- Checkout is COD only; this migration does not implement online payments or refunds.

alter table public.orders add column if not exists coupon_code text;
alter table public.orders add column if not exists coupon_name text;
alter table public.orders add column if not exists coupon_discount_type text;
alter table public.orders add column if not exists coupon_discount_amount numeric not null default 0;
alter table public.orders add column if not exists coupon_shipping_discount numeric not null default 0;
alter table public.orders add column if not exists coupon_original_subtotal numeric;

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null default '',
  discount_type text not null check (discount_type in ('percentage', 'fixed', 'free_shipping')),
  discount_value numeric not null default 0 check (discount_value >= 0),
  max_discount_amount numeric check (max_discount_amount is null or max_discount_amount >= 0),
  minimum_purchase numeric not null default 0 check (minimum_purchase >= 0),
  maximum_order_amount numeric check (maximum_order_amount is null or maximum_order_amount >= minimum_purchase),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  active boolean not null default true,
  is_public boolean not null default true,
  show_to_customers boolean not null default true,
  archived boolean not null default false,
  usage_limit integer check (usage_limit is null or usage_limit >= 1),
  per_customer_limit integer check (per_customer_limit is null or per_customer_limit >= 1),
  first_order_only boolean not null default false,
  new_customers_only boolean not null default false,
  existing_customers_only boolean not null default false,
  eligible_product_ids bigint[] not null default '{}',
  excluded_product_ids bigint[] not null default '{}',
  eligible_categories text[] not null default '{}',
  excluded_categories text[] not null default '{}',
  eligible_customer_ids uuid[] not null default '{}',
  promote boolean not null default false,
  banner_title text not null default '',
  banner_copy text not null default '',
  banner_cta text not null default 'Shop now',
  restore_usage_on_cancel boolean not null default false,
  created_by text not null default '',
  updated_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupons_code_format check (code = upper(code) and code ~ '^[A-Z0-9_-]{3,40}$'),
  constraint coupons_dates_ordered check (expires_at > starts_at),
  constraint coupons_customer_type_check check (
    not (new_customers_only and existing_customers_only)
    and not (first_order_only and existing_customers_only)
  )
);

create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete restrict,
  order_id uuid not null unique references public.orders(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  coupon_code text not null,
  coupon_name text not null,
  customer_name text not null default '',
  customer_email text not null default '',
  order_subtotal numeric not null check (order_subtotal >= 0),
  discount_amount numeric not null check (discount_amount >= 0),
  shipping_discount_amount numeric not null default 0 check (shipping_discount_amount >= 0),
  final_total numeric not null check (final_total >= 0),
  status text not null default 'redeemed' check (status in ('redeemed', 'cancelled')),
  usage_restored boolean not null default false,
  items_snapshot jsonb not null default '[]'::jsonb,
  redeemed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.coupon_audit_history (
  id bigint generated always as identity primary key,
  coupon_id uuid references public.coupons(id) on delete set null,
  coupon_code text not null default '',
  admin_email text not null,
  action text not null,
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists coupons_status_dates_idx on public.coupons (active, archived, starts_at, expires_at);
create index if not exists coupons_public_dates_idx on public.coupons (is_public, show_to_customers, starts_at, expires_at)
  where not archived;
create index if not exists coupon_redemptions_coupon_date_idx on public.coupon_redemptions (coupon_id, redeemed_at desc);
create index if not exists coupon_redemptions_user_idx on public.coupon_redemptions (user_id, coupon_id, redeemed_at desc);
create index if not exists coupon_audit_history_coupon_idx on public.coupon_audit_history (coupon_id, created_at desc);

alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.coupon_audit_history enable row level security;
revoke all on public.coupons, public.coupon_redemptions, public.coupon_audit_history from public, anon, authenticated;
grant all on public.coupons, public.coupon_redemptions, public.coupon_audit_history to service_role;
grant usage, select on sequence public.coupon_audit_history_id_seq to service_role;

create or replace function public.ajr_coupon_quote(
  p_code text,
  p_user_id uuid,
  p_items jsonb,
  p_subtotal numeric,
  p_shipping numeric
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_coupon public.coupons%rowtype;
  v_previous_orders integer;
  v_usage integer;
  v_customer_usage integer;
  v_eligible_subtotal numeric := 0;
  v_item_subtotal numeric := 0;
  v_discount numeric := 0;
  v_shipping_discount numeric := 0;
  v_shipping numeric := greatest(0, coalesce(p_shipping, 0));
  v_total numeric;
begin
  if p_user_id is null then
    return jsonb_build_object('error', 'Sign in to use a coupon.');
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('error', 'Your cart is empty.');
  end if;
  if p_subtotal is null or p_subtotal < 0 or p_shipping is null or p_shipping < 0 then
    return jsonb_build_object('error', 'The cart total could not be verified.');
  end if;
  select coalesce(sum((item->>'price')::numeric * (item->>'quantity')::integer), 0)
    into v_item_subtotal
    from jsonb_array_elements(p_items) as item;
  if abs(v_item_subtotal - p_subtotal) > 0.01 then
    return jsonb_build_object('error', 'The cart total could not be verified.');
  end if;

  select * into v_coupon from public.coupons
    where code = upper(trim(coalesce(p_code, ''))) and not archived;
  if not found then return jsonb_build_object('error', 'This coupon code is invalid.'); end if;
  if not v_coupon.active then return jsonb_build_object('error', 'This coupon is inactive.'); end if;
  if v_coupon.starts_at > now() then return jsonb_build_object('error', 'This coupon is not active yet.'); end if;
  if v_coupon.expires_at <= now() then return jsonb_build_object('error', 'This coupon has expired.'); end if;
  if p_subtotal < v_coupon.minimum_purchase then
    return jsonb_build_object('error', format('Add ₹%s more to use this coupon.', trim(to_char(v_coupon.minimum_purchase - p_subtotal, 'FM999999999990.00'))));
  end if;
  if v_coupon.maximum_order_amount is not null and p_subtotal > v_coupon.maximum_order_amount then
    return jsonb_build_object('error', 'This coupon is not valid for this order amount.');
  end if;
  if cardinality(v_coupon.eligible_customer_ids) > 0
     and not (p_user_id = any(v_coupon.eligible_customer_ids)) then
    return jsonb_build_object('error', 'This coupon is not available for this account.');
  end if;

  select coalesce(sum((item->>'price')::numeric * (item->>'quantity')::integer), 0)
    into v_eligible_subtotal
    from jsonb_array_elements(p_items) as item
    where (cardinality(v_coupon.eligible_product_ids) = 0 or (item->>'id')::bigint = any(v_coupon.eligible_product_ids))
      and not ((item->>'id')::bigint = any(v_coupon.excluded_product_ids))
      and (cardinality(v_coupon.eligible_categories) = 0 or coalesce(item->>'category', item->>'type', '') = any(v_coupon.eligible_categories))
      and not (coalesce(item->>'category', item->>'type', '') = any(v_coupon.excluded_categories));
  if cardinality(v_coupon.eligible_product_ids) > 0
     or cardinality(v_coupon.excluded_product_ids) > 0
     or cardinality(v_coupon.eligible_categories) > 0
     or cardinality(v_coupon.excluded_categories) > 0 then
    if v_eligible_subtotal <= 0 then
      return jsonb_build_object('error', 'This coupon is not applicable to the selected products.');
    end if;
  else
    v_eligible_subtotal := p_subtotal;
  end if;
  if v_eligible_subtotal > p_subtotal then
    return jsonb_build_object('error', 'The cart total could not be verified.');
  end if;

  select count(*) into v_previous_orders from public.orders
    where user_id = p_user_id and lower(coalesce(status, '')) <> 'cancelled';
  if v_coupon.first_order_only and v_previous_orders > 0 then
    return jsonb_build_object('error', 'This coupon is valid for first-time customers only.');
  end if;
  if v_coupon.new_customers_only and v_previous_orders > 0 then
    return jsonb_build_object('error', 'This offer is for new customers only.');
  end if;
  if v_coupon.existing_customers_only and v_previous_orders = 0 then
    return jsonb_build_object('error', 'This offer is for existing customers only.');
  end if;

  select count(*) into v_usage from public.coupon_redemptions
    where coupon_id = v_coupon.id and not usage_restored;
  if v_coupon.usage_limit is not null and v_usage >= v_coupon.usage_limit then
    return jsonb_build_object('error', 'This coupon has reached its usage limit.');
  end if;
  select count(*) into v_customer_usage from public.coupon_redemptions
    where coupon_id = v_coupon.id and user_id = p_user_id and not usage_restored;
  if v_coupon.per_customer_limit is not null and v_customer_usage >= v_coupon.per_customer_limit then
    return jsonb_build_object('error', 'You have reached the usage limit for this coupon.');
  end if;

  if v_coupon.discount_type = 'percentage' then
    v_discount := v_eligible_subtotal * v_coupon.discount_value / 100;
    if v_coupon.max_discount_amount is not null then
      v_discount := least(v_discount, v_coupon.max_discount_amount);
    end if;
  elsif v_coupon.discount_type = 'fixed' then
    v_discount := least(v_eligible_subtotal, v_coupon.discount_value);
  elsif v_coupon.discount_type = 'free_shipping' then
    v_shipping_discount := v_shipping;
    v_shipping := 0;
  end if;
  v_discount := round(least(v_eligible_subtotal, greatest(0, v_discount)), 2);
  v_total := greatest(0, round(p_subtotal - v_discount + v_shipping, 2));

  return jsonb_build_object(
    'couponId', v_coupon.id,
    'code', v_coupon.code,
    'name', v_coupon.name,
    'discountType', v_coupon.discount_type,
    'eligibleSubtotal', round(v_eligible_subtotal, 2),
    'subtotal', round(p_subtotal, 2),
    'discount', v_discount,
    'shippingDiscount', round(v_shipping_discount, 2),
    'shipping', round(v_shipping, 2),
    'total', v_total
  );
end;
$$;

create or replace function public.ajr_create_coupon_order(
  p_order jsonb,
  p_coupon_code text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_coupon public.coupons%rowtype;
  v_quote jsonb;
  v_order public.orders%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(coalesce(p_order->>'user_id', ''), 0));
  select * into v_coupon from public.coupons
    where code = upper(trim(coalesce(p_coupon_code, ''))) and not archived
    for update;
  if not found then return jsonb_build_object('error', 'This coupon code is invalid.'); end if;

  v_quote := public.ajr_coupon_quote(
    p_coupon_code,
    nullif(p_order->>'user_id', '')::uuid,
    p_order->'items',
    nullif(p_order->>'subtotal', '')::numeric,
    nullif(p_order->>'shipping', '')::numeric
  );
  if v_quote ? 'error' then return v_quote; end if;

  insert into public.orders (
    order_number, customer_name, email, phone, address, items, subtotal, shipping, total,
    status, channel, user_id, payment_method, payment_status, whatsapp_opt_in, whatsapp_opt_in_at,
    idempotency_key, coupon_code, coupon_name, coupon_discount_type, coupon_discount_amount,
    coupon_shipping_discount, coupon_original_subtotal
  ) values (
    p_order->>'order_number', p_order->>'customer_name', p_order->>'email',
    coalesce(p_order->>'phone', ''), coalesce(p_order->>'address', ''), p_order->'items',
    (v_quote->>'subtotal')::numeric, (v_quote->>'shipping')::numeric, (v_quote->>'total')::numeric,
    coalesce(p_order->>'status', 'Pending'), coalesce(p_order->>'channel', 'Online'),
    (p_order->>'user_id')::uuid, coalesce(p_order->>'payment_method', 'COD'),
    coalesce(p_order->>'payment_status', 'Pending'),
    coalesce((p_order->>'whatsapp_opt_in')::boolean, false),
    nullif(p_order->>'whatsapp_opt_in_at', '')::timestamptz,
    nullif(p_order->>'idempotency_key', ''),
    v_coupon.code, v_coupon.name, v_coupon.discount_type, (v_quote->>'discount')::numeric,
    (v_quote->>'shippingDiscount')::numeric,
    (v_quote->>'subtotal')::numeric
  ) returning * into v_order;

  insert into public.coupon_redemptions (
    coupon_id, order_id, user_id, coupon_code, coupon_name, customer_name, customer_email,
    order_subtotal, discount_amount, shipping_discount_amount, final_total, items_snapshot
  ) values (
    v_coupon.id, v_order.id, v_order.user_id, v_coupon.code, v_coupon.name,
    v_order.customer_name, v_order.email, v_order.subtotal,
    (v_quote->>'discount')::numeric, (v_quote->>'shippingDiscount')::numeric, v_order.total, v_order.items
  );

  return jsonb_build_object('order', to_jsonb(v_order), 'quote', v_quote);
end;
$$;

create or replace function public.ajr_restore_coupon_usage_on_cancel()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_restore boolean;
begin
  if old.status is distinct from new.status then
    select c.restore_usage_on_cancel into v_restore
      from public.coupon_redemptions r
      join public.coupons c on c.id = r.coupon_id
      where r.order_id = new.id;
    if found then
      if lower(coalesce(new.status, '')) = 'cancelled' and lower(coalesce(old.status, '')) <> 'cancelled' then
        update public.coupon_redemptions set
          status = 'cancelled',
          usage_restored = coalesce(v_restore, false)
          where order_id = new.id;
      elsif lower(coalesce(old.status, '')) = 'cancelled' and lower(coalesce(new.status, '')) <> 'cancelled' then
        update public.coupon_redemptions set status = 'redeemed', usage_restored = false where order_id = new.id;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_restore_coupon_usage_on_cancel on public.orders;
create trigger trg_restore_coupon_usage_on_cancel
  after update of status on public.orders
  for each row execute function public.ajr_restore_coupon_usage_on_cancel();

revoke all on function public.ajr_coupon_quote(text, uuid, jsonb, numeric, numeric) from public, anon, authenticated;
revoke all on function public.ajr_create_coupon_order(jsonb, text) from public, anon, authenticated;
grant execute on function public.ajr_coupon_quote(text, uuid, jsonb, numeric, numeric) to service_role;
grant execute on function public.ajr_create_coupon_order(jsonb, text) to service_role;
