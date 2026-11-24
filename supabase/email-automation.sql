-- Apply after product-reminders.sql, cart-recovery-automation.sql and
-- notification-automation.sql. Provider usage is supplied only by the
-- authenticated Edge Function; reservations serialize concurrent sends.
create table if not exists public.email_automation_settings (
  id boolean primary key default true check (id),
  cart_enabled boolean not null default true,
  product_enabled boolean not null default true,
  daily_limit integer not null default 100 check (daily_limit between 1 and 100),
  monthly_limit integer not null default 3000 check (monthly_limit between 1 and 3000),
  daily_transactional_reserve integer not null default 20 check (daily_transactional_reserve >= 0),
  monthly_transactional_reserve integer not null default 300 check (monthly_transactional_reserve >= 0),
  last_scheduler_at timestamptz,
  last_scheduler_result text,
  updated_at timestamptz not null default now(),
  check (daily_transactional_reserve <= daily_limit),
  check (monthly_transactional_reserve <= monthly_limit)
);
insert into public.email_automation_settings(id) values (true) on conflict do nothing;
alter table public.email_automation_settings add column if not exists last_scheduler_at timestamptz;
alter table public.email_automation_settings add column if not exists last_scheduler_result text;
alter table public.email_automation_settings enable row level security;
revoke all on public.email_automation_settings from public, anon, authenticated;
grant select, update on public.email_automation_settings to service_role;

create table if not exists public.email_quota_reservations (
  id uuid primary key default gen_random_uuid(),
  campaign text not null check (campaign in ('cart', 'product')),
  status text not null default 'reserved' check (status in ('reserved', 'sent', 'uncertain', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists email_quota_reservations_period_idx on public.email_quota_reservations(created_at, status);
alter table public.email_quota_reservations enable row level security;
revoke all on public.email_quota_reservations from public, anon, authenticated;
grant select, insert, update on public.email_quota_reservations to service_role;

create table if not exists public.email_provider_rate_slot (
  id boolean primary key default true check (id),
  next_at timestamptz not null default now()
);
insert into public.email_provider_rate_slot(id) values (true) on conflict do nothing;
alter table public.email_provider_rate_slot enable row level security;
revoke all on public.email_provider_rate_slot from public, anon, authenticated;

create or replace function public.ajr_reserve_resend_api_slot()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare slot timestamptz; delay_ms integer;
begin
  select greatest(next_at, clock_timestamp()) into strict slot
    from public.email_provider_rate_slot where id for update;
  delay_ms := greatest(0, ceil(extract(epoch from (slot - clock_timestamp())) * 1000)::integer);
  if delay_ms > 20000 then raise exception 'Provider rate queue is full'; end if;
  update public.email_provider_rate_slot set next_at = slot + interval '600 milliseconds' where id;
  return delay_ms;
end $$;
revoke all on function public.ajr_reserve_resend_api_slot() from public, anon, authenticated;
grant execute on function public.ajr_reserve_resend_api_slot() to service_role;

create or replace function public.ajr_reserve_marketing_email(
  p_campaign text, p_daily_used integer, p_monthly_used integer,
  p_provider_daily_limit integer, p_provider_monthly_limit integer
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare cfg public.email_automation_settings; daily_pending integer; monthly_pending integer;
  daily_start timestamptz; monthly_start timestamptz; reservation uuid;
begin
  if p_campaign not in ('cart', 'product') or p_daily_used is null or p_daily_used < 0
    or p_monthly_used is null or p_monthly_used < 0
    or (p_provider_daily_limit is not null and p_provider_daily_limit < 0)
    or (p_provider_monthly_limit is not null and p_provider_monthly_limit < 0) then
    raise exception 'Invalid provider quota';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ajr-email-quota', 0));
  select * into strict cfg from public.email_automation_settings where id;
  if (p_campaign = 'cart' and not cfg.cart_enabled) or (p_campaign = 'product' and not cfg.product_enabled) then return null; end if;
  daily_start := now() - interval '24 hours';
  monthly_start := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  select count(*) filter (where created_at >= daily_start),
         count(*) filter (where created_at >= monthly_start)
    into daily_pending, monthly_pending
    from public.email_quota_reservations
    where created_at >= least(monthly_start, daily_start) and
      (status in ('reserved', 'uncertain') or (status = 'sent' and created_at >= now() - interval '5 minutes'));
  if p_daily_used + daily_pending >= least(cfg.daily_limit, coalesce(p_provider_daily_limit, cfg.daily_limit)) - cfg.daily_transactional_reserve
    or p_monthly_used + monthly_pending >= least(cfg.monthly_limit, coalesce(p_provider_monthly_limit, cfg.monthly_limit)) - cfg.monthly_transactional_reserve then
    return null;
  end if;
  insert into public.email_quota_reservations(campaign) values (p_campaign) returning id into reservation;
  return reservation;
end $$;
revoke all on function public.ajr_reserve_marketing_email(text, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.ajr_reserve_marketing_email(text, integer, integer, integer, integer) to service_role;

create or replace function public.ajr_finish_marketing_email(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_status not in ('sent', 'uncertain', 'rejected') then raise exception 'Invalid reservation status'; end if;
  update public.email_quota_reservations set status = p_status, updated_at = now()
    where id = p_id and status = 'reserved';
  if not found then raise exception 'Reservation not found or already finalized'; end if;
end $$;
revoke all on function public.ajr_finish_marketing_email(uuid, text) from public, anon, authenticated;
grant execute on function public.ajr_finish_marketing_email(uuid, text) to service_role;

create or replace function public.ajr_record_email_scheduler_run(p_status text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_status not in ('ok', 'failed') then raise exception 'Invalid scheduler status'; end if;
  update public.email_automation_settings set last_scheduler_at = now(), last_scheduler_result = p_status where id;
end $$;
revoke all on function public.ajr_record_email_scheduler_run(text) from public, anon, authenticated;
grant execute on function public.ajr_record_email_scheduler_run(text) to service_role;

create or replace function public.ajr_marketing_campaign_enabled(p_campaign text)
returns boolean language sql security definer set search_path = public, pg_temp as $$
  select case p_campaign when 'cart' then cart_enabled when 'product' then product_enabled else false end
  from public.email_automation_settings where id
$$;
revoke all on function public.ajr_marketing_campaign_enabled(text) from public, anon, authenticated;
grant execute on function public.ajr_marketing_campaign_enabled(text) to service_role;

create or replace function public.ajr_marketing_email_still_eligible(p_campaign text, p_id uuid, p_recipient text)
returns boolean language sql security definer set search_path = public, pg_temp as $$
  select case
    when p_campaign = 'product' then exists (
      select 1 from public.product_reminders r
      join auth.users u on u.id = r.user_id
      join public.product_reminder_preferences p on p.user_id = r.user_id
      join public.products product on product.id = r.product_id
      join public.email_automation_settings s on s.id
      where r.id = p_id and s.product_enabled and r.status = 'sending' and r.cancel_reason is null
        and r.last_activity_at <= now() - interval '2 hours' and p.opted_in and p.suppressed_at is null
        and product.active and u.email_confirmed_at is not null and lower(u.email) = lower(p_recipient)
        and not exists (select 1 from public.carts c where c.user_id = r.user_id
          and jsonb_typeof(c.items) = 'array' and jsonb_array_length(c.items) > 0)
    )
    when p_campaign = 'cart' then exists (
      select 1 from public.abandoned_carts c
      join auth.users u on u.id = c.user_id
      join public.email_automation_settings s on s.id
      where c.id = p_id and s.cart_enabled and c.reminder_result = 'sending'
        and c.recovery_email_consent and c.closed_at is null and c.order_id is null and c.reminder_sent_at is null
        and c.last_activity_at <= now() - interval '30 minutes'
        and u.email_confirmed_at is not null and lower(u.email) = lower(p_recipient)
        and lower(c.customer_email) = lower(p_recipient)
        and not exists (select 1 from public.cart_reminder_preferences p where p.user_id = c.user_id
          and (not p.opted_in or p.suppressed_at is not null))
        and exists (select 1 from public.carts saved where saved.user_id = c.user_id
          and jsonb_typeof(saved.items) = 'array' and jsonb_array_length(saved.items) > 0)
    )
    else false end
$$;
revoke all on function public.ajr_marketing_email_still_eligible(text, uuid, text) from public, anon, authenticated;
grant execute on function public.ajr_marketing_email_still_eligible(text, uuid, text) to service_role;

create or replace function public.ajr_defer_marketing_email(p_campaign text, p_id uuid, p_event_id uuid default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_campaign = 'product' then
    update public.product_reminders set status = case when cancel_reason is null then 'pending' else 'cancelled' end,
      attempts = greatest(attempts - 1, 0),
      next_attempt_at = now() + interval '30 minutes', error = 'Paused by email quota or automation setting.', updated_at = now()
      where id = p_id and status = 'sending';
  elsif p_campaign = 'cart' then
    update public.abandoned_carts set reminder_result = 'failed',
      reminder_attempts = greatest(reminder_attempts - 1, 0),
      reminder_error = 'Paused by email quota or automation setting.',
      recovery_token_hash = null, recovery_token_expires_at = null, updated_at = now()
      where id = p_id and reminder_result = 'sending' and reminder_sent_at is null;
    if p_event_id is not null then
      update public.notification_events set status = 'failed', retry_count = greatest(retry_count - 1, 0),
        error = 'Paused by email quota or automation setting.', updated_at = now()
        where id = p_event_id and status = 'sending';
    end if;
  else raise exception 'Invalid campaign';
  end if;
end $$;
revoke all on function public.ajr_defer_marketing_email(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.ajr_defer_marketing_email(text, uuid, uuid) to service_role;
