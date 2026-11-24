-- Product-view marketing is separate from anonymous analytics and cart consent.
-- Apply after customer-features.sql, abandoned-carts.sql, notification-automation.sql and visitor-analytics.sql.
-- Older catalog installations may not yet have these optional offer fields.
alter table public.products add column if not exists varieties jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists pack_sizes text[] not null default '{}'::text[];

create table if not exists public.product_reminder_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  opted_in boolean not null default false,
  opted_in_at timestamptz,
  opted_out_at timestamptz,
  suppressed_at timestamptz,
  suppression_reason text,
  updated_at timestamptz not null default now()
);

alter table public.product_reminder_preferences add column if not exists consent_source text;
alter table public.product_reminder_preferences add column if not exists consent_version text;

-- Only new accounts can create a signup preference; repeat signup attempts must
-- never change an existing customer's opt-out.
create or replace function public.ajr_signup_product_marketing_preference()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.raw_user_meta_data -> 'product_marketing_consent' = 'true'::jsonb then
    insert into public.product_reminder_preferences
      (user_id, opted_in, opted_in_at, consent_source, consent_version)
    values (new.id, true, now(), 'signup',
      case when new.raw_user_meta_data -> 'cart_marketing_consent' = 'true'::jsonb
        then 'product-and-cart-v2' else 'product-view-v1' end)
    on conflict (user_id) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.ajr_signup_product_marketing_preference() from public, anon, authenticated;
drop trigger if exists ajr_signup_product_marketing_preference on auth.users;
create trigger ajr_signup_product_marketing_preference after insert on auth.users
for each row execute function public.ajr_signup_product_marketing_preference();

create table if not exists public.product_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id bigint not null references public.products(id),
  first_view_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  view_count integer not null default 1,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'uncertain', 'cancelled')),
  cancel_reason text,
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  attempted_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  delivery_status text,
  error text,
  clicked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists product_reminders_one_pending
  on public.product_reminders(user_id, product_id) where status = 'pending';
create index if not exists product_reminders_due
  on public.product_reminders(last_activity_at) where status = 'pending';
create index if not exists product_reminders_user_history
  on public.product_reminders(user_id, sent_at desc);
create unique index if not exists product_reminders_provider_message
  on public.product_reminders(provider_message_id) where provider_message_id is not null;

create table if not exists public.product_reminder_clicks (
  id bigint generated always as identity primary key,
  reminder_id uuid not null references public.product_reminders(id) on delete cascade,
  clicked_at timestamptz not null default now()
);
create index if not exists product_reminder_clicks_reminder_time
  on public.product_reminder_clicks(reminder_id, clicked_at desc);

alter table public.product_reminder_preferences enable row level security;
alter table public.product_reminders enable row level security;
alter table public.product_reminder_clicks enable row level security;
revoke all on public.product_reminder_preferences, public.product_reminders, public.product_reminder_clicks from public, anon, authenticated;
grant select, insert, update on public.product_reminder_preferences, public.product_reminders to service_role;
grant select, insert on public.product_reminder_clicks to service_role;
revoke all on sequence public.product_reminder_clicks_id_seq from public, anon, authenticated;
grant usage, select on sequence public.product_reminder_clicks_id_seq to service_role;

create or replace function public.ajr_record_product_visit(p_user_id uuid, p_product_id bigint)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if not exists (
    select 1 from public.product_reminder_preferences
    where user_id = p_user_id and opted_in and suppressed_at is null
  ) or not exists (
    select 1 from public.products where id = p_product_id and active
  ) then return; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  update public.product_reminders
    set status = case when status = 'sending' then 'sending' else 'cancelled' end,
      cancel_reason = 'new_product_activity', updated_at = now()
    where user_id = p_user_id and
      (status = 'sending' or (status = 'pending' and product_id <> p_product_id));

  insert into public.product_reminders(user_id, product_id)
  values (p_user_id, p_product_id)
  on conflict (user_id, product_id) where status = 'pending'
  do update set last_activity_at = now(),
    view_count = public.product_reminders.view_count + 1, updated_at = now();
end $$;

-- A cart insertion cancels the candidate even if the customer removes it later.
create or replace function public.ajr_cancel_product_reminders_for_cart()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if jsonb_typeof(new.items) = 'array' then
    if jsonb_array_length(new.items) > 0 then
      update public.product_reminders
      set cancel_reason = 'cart_activity', updated_at = now()
      where user_id = new.user_id and status = 'sending' and cancel_reason is null;
    end if;
    update public.product_reminders r
    set status = case when r.status = 'sending' then 'sending' else 'cancelled' end,
      cancel_reason = 'added_to_cart', updated_at = now()
    where r.user_id = new.user_id and r.status in ('pending', 'sending')
      and exists (select 1 from jsonb_array_elements(new.items) item
        where item -> 'product' ->> 'id' = r.product_id::text);
  end if;
  return new;
end $$;

drop trigger if exists ajr_cancel_product_reminders_for_cart on public.carts;
create trigger ajr_cancel_product_reminders_for_cart after insert or update of items on public.carts
for each row execute function public.ajr_cancel_product_reminders_for_cart();

create or replace function public.ajr_cancel_product_reminders_for_order()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if new.user_id is not null and jsonb_typeof(new.items) = 'array'
    and lower(coalesce(new.status, '')) <> 'cancelled'
    and (lower(coalesce(new.payment_method, '')) in ('cod', 'cash on delivery')
      or lower(coalesce(new.payment_status, '')) in ('paid', 'confirmed')) then
    update public.product_reminders r
    set status = case when r.status = 'sending' then 'sending' else 'cancelled' end,
      cancel_reason = 'purchased', updated_at = now()
    where r.user_id = new.user_id and r.status in ('pending', 'sending')
      and exists (select 1 from jsonb_array_elements(new.items) item
        where item ->> 'id' = r.product_id::text);
  end if;
  return new;
end $$;

drop trigger if exists ajr_cancel_product_reminders_for_order on public.orders;
create trigger ajr_cancel_product_reminders_for_order
after insert or update of items, status, payment_status, payment_method on public.orders
for each row execute function public.ajr_cancel_product_reminders_for_order();

create or replace function public.ajr_apply_product_reminder_receipt(p_provider_id text)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare target_user uuid; latest_status text;
begin
  select user_id into target_user from public.product_reminders where provider_message_id = p_provider_id;
  if target_user is null then return; end if;
  select case
    when bool_or(status = 'email.complained') then 'email.complained'
    when bool_or(status = 'email.bounced') then 'email.bounced'
    when bool_or(status = 'email.suppressed') then 'email.suppressed'
    when bool_or(status = 'email.failed') then 'email.failed'
    when bool_or(status = 'email.delivered') then 'email.delivered'
    else null end into latest_status
  from public.notification_receipts where provider = 'resend' and provider_message_id = p_provider_id;
  if latest_status is null then return; end if;
  update public.product_reminders set delivery_status = latest_status, updated_at = now()
    where provider_message_id = p_provider_id;
  if latest_status in ('email.bounced', 'email.complained', 'email.suppressed') then
    update public.product_reminder_preferences set opted_in = false, suppressed_at = now(),
      suppression_reason = latest_status, updated_at = now() where user_id = target_user;
    update public.product_reminders set status = 'cancelled', cancel_reason = latest_status, updated_at = now()
      where user_id = target_user and status = 'pending';
  end if;
end $$;

create or replace function public.ajr_product_reminder_receipt_trigger()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  perform public.ajr_apply_product_reminder_receipt(new.provider_message_id);
  return new;
end $$;

drop trigger if exists ajr_product_reminder_receipt on public.notification_receipts;
create trigger ajr_product_reminder_receipt after insert on public.notification_receipts
for each row execute function public.ajr_product_reminder_receipt_trigger();

drop trigger if exists ajr_product_reminder_receipt_reconcile on public.product_reminders;
create trigger ajr_product_reminder_receipt_reconcile after update of provider_message_id on public.product_reminders
for each row when (new.provider_message_id is not null)
execute function public.ajr_product_reminder_receipt_trigger();

create or replace function public.ajr_claim_product_reminders(p_limit integer default 10)
returns setof public.product_reminders language plpgsql security invoker set search_path = public, pg_temp as $$
declare candidate public.product_reminders;
begin
  -- Unknown provider outcomes are never retried automatically.
  update public.product_reminders
    set status = 'uncertain', error = 'Send outcome unknown; manual review required.', updated_at = now()
    where status = 'sending' and attempted_at < now() - interval '10 minutes';

  for candidate in
    select r.* from public.product_reminders r
    where r.status = 'pending'
      and r.last_activity_at <= now() - interval '2 hours'
      and (r.next_attempt_at is null or r.next_attempt_at <= now())
    order by r.last_activity_at
    for update skip locked
  loop
    if not pg_try_advisory_xact_lock(hashtextextended(candidate.user_id::text, 0)) then continue; end if;
    if not exists (select 1 from public.product_reminder_preferences p
      where p.user_id = candidate.user_id and p.opted_in and p.suppressed_at is null) then
      update public.product_reminders set status = 'cancelled', cancel_reason = 'no_consent', updated_at = now() where id = candidate.id;
      continue;
    end if;
    if exists (select 1 from public.carts c, jsonb_array_elements(
        case when jsonb_typeof(c.items) = 'array' then c.items else '[]'::jsonb end) item
      where c.user_id = candidate.user_id and item -> 'product' ->> 'id' = candidate.product_id::text) then
      update public.product_reminders set status = 'cancelled', cancel_reason = 'added_to_cart', updated_at = now() where id = candidate.id;
      continue;
    end if;
    -- Let the cart-recovery flow take precedence for any open cart. Also
    -- avoid a second marketing email immediately after a recovery attempt.
    if exists (select 1 from public.carts c
      where c.user_id = candidate.user_id and jsonb_typeof(c.items) = 'array'
        and jsonb_array_length(c.items) > 0)
      or exists (select 1 from public.abandoned_carts ac
        where ac.user_id = candidate.user_id
          and ac.reminder_result in ('sending', 'sent')
          and coalesce(ac.reminder_sent_at, ac.reminder_attempt_at) > now() - interval '24 hours') then
      continue;
    end if;
    if exists (select 1 from public.orders o, jsonb_array_elements(
        case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end) item
      where o.user_id = candidate.user_id
        and lower(coalesce(o.status, '')) <> 'cancelled'
        and (lower(coalesce(o.payment_method, '')) in ('cod', 'cash on delivery')
          or lower(coalesce(o.payment_status, '')) in ('paid', 'confirmed'))
        and item ->> 'id' = candidate.product_id::text) then
      update public.product_reminders set status = 'cancelled', cancel_reason = 'purchased', updated_at = now() where id = candidate.id;
      continue;
    end if;
    if exists (select 1 from public.product_reminders recent
      where recent.user_id = candidate.user_id and recent.id <> candidate.id
        and recent.status in ('sending', 'sent', 'uncertain')
        and coalesce(recent.sent_at, recent.attempted_at) > now() - interval '24 hours') then continue; end if;
    if exists (select 1 from public.product_reminders recent
      where recent.user_id = candidate.user_id and recent.product_id = candidate.product_id and recent.id <> candidate.id
        and recent.status in ('sending', 'sent', 'uncertain')
        and coalesce(recent.sent_at, recent.attempted_at) > now() - interval '7 days') then continue; end if;
    update public.product_reminders set status = 'sending', attempts = attempts + 1,
      attempted_at = now(), updated_at = now() where id = candidate.id
      returning * into candidate;
    return next candidate;
    p_limit := p_limit - 1;
    if p_limit <= 0 then return; end if;
  end loop;
end $$;

revoke all on function public.ajr_record_product_visit(uuid, bigint) from public, anon, authenticated;
revoke all on function public.ajr_claim_product_reminders(integer) from public, anon, authenticated;
revoke all on function public.ajr_apply_product_reminder_receipt(text) from public, anon, authenticated;
grant execute on function public.ajr_record_product_visit(uuid, bigint) to service_role;
grant execute on function public.ajr_claim_product_reminders(integer) to service_role;
grant execute on function public.ajr_apply_product_reminder_receipt(text) to service_role;

create or replace function public.ajr_product_reminder_summary(
  p_since timestamptz, p_until timestamptz, p_product_id bigint default null, p_status text default null
) returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with selected as materialized (
    select r.*, p.name as product_name, p.price as product_price, p.image as product_image, u.email,
      pref.opted_in and pref.suppressed_at is null as consent_valid
    from public.product_reminders r
    join public.products p on p.id = r.product_id
    left join auth.users u on u.id = r.user_id
    left join public.product_reminder_preferences pref on pref.user_id = r.user_id
    where r.first_view_at >= p_since and r.first_view_at < p_until
      and (p_product_id is null or r.product_id = p_product_id)
      and (p_status is null or r.status = p_status)
  ),
  attributed_items as (
    select o.id as order_id, chosen.id as reminder_id,
      case when item ->> 'price' ~ '^[0-9]+([.][0-9]+)?$' and item ->> 'quantity' ~ '^[0-9]+$'
        then (item ->> 'price')::numeric * (item ->> 'quantity')::numeric else 0 end as revenue
    from public.orders o
    cross join lateral jsonb_array_elements(case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end) item
    join lateral (
      select r.id from public.product_reminders r
      join public.product_reminder_clicks click on click.reminder_id = r.id
      where r.user_id = o.user_id and r.product_id::text = item ->> 'id'
        and r.status = 'sent'
        and o.created_at >= click.clicked_at and o.created_at < click.clicked_at + interval '7 days'
      order by click.clicked_at desc, r.id desc limit 1
    ) chosen on true
    where lower(coalesce(o.status, '')) <> 'cancelled'
      and (lower(coalesce(o.payment_method, '')) in ('cod', 'cash on delivery')
        or lower(coalesce(o.payment_status, '')) in ('paid', 'confirmed'))
  )
  select jsonb_build_object(
    'totalProductViews', (select count(*) from public.visitor_analytics_events e
      where e.event_name = 'page_view' and e.page = 'product-detail'
        and e.created_at >= p_since and e.created_at < p_until
        and (p_product_id is null or e.product_id = p_product_id)),
    'eligibleVisitors', (select count(distinct user_id) from selected where status = 'pending' and consent_valid),
    'scheduled', (select count(*) from selected where status = 'pending'),
    'sent', (select count(*) from selected where status = 'sent'),
    'failures', (select count(*) from selected where status in ('failed', 'uncertain') or delivery_status in ('email.bounced', 'email.complained', 'email.failed', 'email.suppressed')),
    'clicks', (select count(*) from selected where clicked_at is not null),
    'purchases', (select count(distinct order_id) from attributed_items where reminder_id in (select id from selected)),
    'revenue', (select coalesce(sum(revenue), 0) from attributed_items where reminder_id in (select id from selected)),
    'history', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'userId', user_id, 'email', email, 'productId', product_id, 'productName', product_name,
      'productPrice', product_price, 'productImage', product_image,
      'firstViewAt', first_view_at, 'lastActivityAt', last_activity_at, 'views', view_count,
      'status', status, 'reason', cancel_reason, 'sentAt', sent_at,
      'deliveryStatus', delivery_status, 'clickedAt', clicked_at, 'error', error
    ) order by first_view_at desc) from (select * from selected order by first_view_at desc limit 100) recent), '[]'::jsonb)
  )
$$;
revoke all on function public.ajr_product_reminder_summary(timestamptz, timestamptz, bigint, text) from public, anon, authenticated;
grant execute on function public.ajr_product_reminder_summary(timestamptz, timestamptz, bigint, text) to service_role;
