-- AJR abandoned cart tracking and one-time recovery.
-- Apply manually in Supabase SQL Editor after customer-features.sql.
-- This migration contains no sample data and is safe to run more than once.

create table if not exists public.abandoned_carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  guest_token_hash text unique,
  cart_items jsonb not null default '[]'::jsonb,
  cart_total numeric not null default 0,
  item_count integer not null default 0,
  customer_name text not null default '',
  customer_email text not null default '',
  customer_phone text not null default '',
  device_category text,
  recovery_email_consent boolean not null default false,
  recovery_email_consent_at timestamptz,
  cart_started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  closed_at timestamptz,
  guest_token_expires_at timestamptz,
  guest_window_started_at timestamptz,
  guest_window_count integer not null default 0,
  order_id uuid references public.orders (id) on delete set null,
  recovery_token_hash text,
  recovery_token_expires_at timestamptz,
  recovery_redeemed_at timestamptz,
  reminder_attempt_at timestamptz,
  reminder_sent_at timestamptz,
  reminder_result text,
  reminder_provider_id text,
  reminder_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint abandoned_carts_guest_owner_check check (user_id is not null or guest_token_hash is not null),
  constraint abandoned_carts_device_check check (device_category is null or device_category in ('Mobile', 'Tablet', 'Desktop')),
  constraint abandoned_carts_reminder_result_check check (reminder_result is null or reminder_result in ('sent', 'failed', 'sending', 'revoked'))
);

alter table public.abandoned_carts drop constraint if exists abandoned_carts_user_id_key;
alter table public.abandoned_carts drop constraint if exists abandoned_carts_reminder_result_check;
alter table public.abandoned_carts add constraint abandoned_carts_reminder_result_check
  check (reminder_result is null or reminder_result in ('sent', 'failed', 'sending', 'revoked'));
alter table public.abandoned_carts add column if not exists closed_at timestamptz;
alter table public.abandoned_carts add column if not exists reminder_provider_id text;
alter table public.abandoned_carts add column if not exists reminder_error text;
create unique index if not exists abandoned_carts_one_open_user_idx
  on public.abandoned_carts (user_id)
  where user_id is not null and closed_at is null;
create index if not exists abandoned_carts_activity_idx on public.abandoned_carts (last_activity_at desc);
create index if not exists abandoned_carts_order_idx on public.abandoned_carts (order_id);
create index if not exists abandoned_carts_recovery_token_idx on public.abandoned_carts (recovery_token_hash);
create unique index if not exists abandoned_carts_recovery_token_unique_idx
  on public.abandoned_carts (recovery_token_hash)
  where recovery_token_hash is not null;

alter table public.abandoned_carts enable row level security;
revoke all on public.abandoned_carts from public, anon, authenticated;
grant all on public.abandoned_carts to service_role;

create or replace function public.ajr_guest_cart_tracking(
  p_token_hash text,
  p_expires_at timestamptz,
  p_items jsonb,
  p_cart_total numeric,
  p_item_count integer,
  p_device text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_row public.abandoned_carts%rowtype;
begin
  if p_token_hash is null or length(p_token_hash) <> 64
     or p_items is null or jsonb_typeof(p_items) <> 'array'
     or p_item_count < 0 or p_item_count > 5940
     or p_cart_total < 0
     or p_device not in ('Mobile', 'Tablet', 'Desktop') then
    return false;
  end if;

  select * into v_row from public.abandoned_carts
    where guest_token_hash = p_token_hash
    for update;

  if found then
    if v_row.guest_token_expires_at <= v_now or v_row.user_id is not null then
      return false;
    end if;
    if v_row.guest_window_started_at > v_now - interval '10 minutes'
       and v_row.guest_window_count >= 30 then
      return false;
    end if;
    update public.abandoned_carts set
      cart_items = p_items,
      cart_total = p_cart_total,
      item_count = p_item_count,
      device_category = p_device,
      last_activity_at = v_now,
      updated_at = v_now,
      guest_window_started_at = case
        when v_row.guest_window_started_at is null or v_row.guest_window_started_at <= v_now - interval '10 minutes'
          then v_now else v_row.guest_window_started_at end,
      guest_window_count = case
        when v_row.guest_window_started_at is null or v_row.guest_window_started_at <= v_now - interval '10 minutes'
          then 1 else v_row.guest_window_count + 1 end
      where id = v_row.id;
  else
    if p_expires_at <= v_now or p_expires_at > v_now + interval '31 days' then
      return false;
    end if;
    insert into public.abandoned_carts (
      guest_token_hash, guest_token_expires_at, cart_items, cart_total, item_count,
      device_category, cart_started_at, last_activity_at, guest_window_started_at, guest_window_count
    ) values (
      p_token_hash, p_expires_at, p_items, p_cart_total, p_item_count,
      p_device, v_now, v_now, v_now, 1
    );
  end if;
  return true;
end;
$$;

create or replace function public.ajr_redeem_cart_recovery(
  p_token_hash text,
  p_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cart public.abandoned_carts%rowtype;
  v_existing jsonb := '[]'::jsonb;
  v_merged jsonb := '[]'::jsonb;
  v_line jsonb;
  v_index bigint;
begin
  select * into v_cart from public.abandoned_carts
    where recovery_token_hash = p_token_hash
    for update;
  if not found or p_token_hash is null or length(p_token_hash) <> 64 then
    return jsonb_build_object('error', 'This recovery link is invalid or has expired.');
  end if;
  if v_cart.user_id is null or v_cart.user_id <> p_user_id then
    return jsonb_build_object('error', 'Sign in to the AJR account that received this reminder.');
  end if;
  if not v_cart.recovery_email_consent or v_cart.recovery_token_expires_at <= now()
     or v_cart.recovery_redeemed_at is not null then
    return jsonb_build_object('error', 'This recovery link is invalid, expired, or already used.');
  end if;

  select items into v_existing from public.carts where user_id = p_user_id;
  v_merged := case when jsonb_typeof(v_existing) = 'array' then v_existing else '[]'::jsonb end;

  for v_line in select value from jsonb_array_elements(v_cart.cart_items) limit 60 loop
    v_index := null;
    select e.ordinality - 1 into v_index
      from jsonb_array_elements(v_merged) with ordinality as e(value, ordinality)
      where e.value #>> '{product,id}' = v_line #>> '{product,id}'
        and coalesce(e.value #>> '{product,selectedWeight}', '250 g') = coalesce(v_line #>> '{product,selectedWeight}', '250 g')
        and coalesce(e.value #>> '{product,selectedVariety}', '') = coalesce(v_line #>> '{product,selectedVariety}', '')
      limit 1;
    -- Preserve matching lines exactly as the customer most recently left them.
    -- The recovery link only restores products absent from the active cart;
    -- adding quantities here would duplicate a cart that was never cleared.
    if v_index is null and jsonb_array_length(v_merged) < 60 then
      v_merged := v_merged || jsonb_build_array(v_line);
    end if;
  end loop;

  insert into public.carts (user_id, items, updated_at)
    values (p_user_id, v_merged, now())
    on conflict (user_id) do update set items = excluded.items, updated_at = excluded.updated_at;
  update public.abandoned_carts set
    recovery_redeemed_at = now(),
    recovery_token_hash = null,
    recovery_token_expires_at = null,
    updated_at = now()
    where id = v_cart.id;

  return jsonb_build_object('items', v_merged);
end;
$$;

revoke all on function public.ajr_guest_cart_tracking(text, timestamptz, jsonb, numeric, integer, text) from public, anon, authenticated;
revoke all on function public.ajr_redeem_cart_recovery(text, uuid) from public, anon, authenticated;
grant execute on function public.ajr_guest_cart_tracking(text, timestamptz, jsonb, numeric, integer, text) to service_role;
grant execute on function public.ajr_redeem_cart_recovery(text, uuid) to service_role;

-- Atomically reserve a small batch for the server-side cron. Row locks let
-- overlapping cron runs work without double-sending. A stale sending record is
-- recoverable only before a token was persisted, when no email could have sent.
drop function if exists public.ajr_claim_cart_recovery_reminders(timestamptz, timestamptz, integer);
create function public.ajr_claim_cart_recovery_reminders(
  p_cutoff timestamptz,
  p_stale_before timestamptz,
  p_limit integer default 20
) returns table (
  id uuid,
  user_id uuid,
  customer_name text,
  customer_email text,
  customer_phone text,
  item_count integer,
  cart_items jsonb,
  whatsapp_marketing_consent boolean,
  attempt_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_cutoff is null or p_stale_before is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Invalid cart reminder claim request';
  end if;

  return query
  with candidates as (
    select ac.id
      from public.abandoned_carts ac
      where ac.user_id is not null
        and ac.recovery_email_consent is true
        and nullif(trim(ac.customer_email), '') is not null
        and ac.item_count > 0
        and jsonb_typeof(ac.cart_items) = 'array'
        and jsonb_array_length(ac.cart_items) > 0
        and ac.closed_at is null
        and ac.order_id is null
        and ac.reminder_sent_at is null
        and ac.last_activity_at <= p_cutoff
        and (
          ac.reminder_attempt_at is null
          or (ac.reminder_result = 'failed' and ac.reminder_attempt_at <= p_stale_before)
          or (ac.reminder_result = 'sending' and ac.reminder_attempt_at <= p_stale_before
              and ac.recovery_token_hash is null and ac.reminder_provider_id is null)
        )
      order by ac.last_activity_at asc
      limit p_limit
      for update skip locked
  ), claimed as (
    update public.abandoned_carts ac
      set reminder_attempt_at = now(),
          reminder_result = 'sending',
          reminder_error = null,
          reminder_provider_id = null,
          updated_at = now()
      from candidates
      where ac.id = candidates.id
       returning ac.id, ac.user_id, ac.customer_name, ac.customer_email, ac.customer_phone, ac.item_count, ac.cart_items, ac.whatsapp_marketing_consent, ac.reminder_attempt_at
  )
  select claimed.id, claimed.user_id, claimed.customer_name, claimed.customer_email, claimed.customer_phone, claimed.item_count, claimed.cart_items, claimed.whatsapp_marketing_consent, claimed.reminder_attempt_at
    from claimed;
end;
$$;

revoke all on function public.ajr_claim_cart_recovery_reminders(timestamptz, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.ajr_claim_cart_recovery_reminders(timestamptz, timestamptz, integer) to service_role;
