-- Apply once after cart-recovery-automation.sql and email-automation.sql.
-- Does not change preferences, existing schedules or delivery records.
begin;

alter table public.abandoned_carts
  add column if not exists reminder_origin text not null default 'automatic';
alter table public.abandoned_carts
  add column if not exists reminder_claim_activity_at timestamptz;
alter table public.abandoned_carts
  drop constraint if exists abandoned_carts_reminder_origin_check;
alter table public.abandoned_carts
  add constraint abandoned_carts_reminder_origin_check
  check (reminder_origin in ('automatic', 'manual'));

create or replace function public.ajr_guard_cart_reminder_claim()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.reminder_result = 'sending' and
    (old.reminder_result is distinct from 'sending' or
     new.reminder_attempt_at is distinct from old.reminder_attempt_at) then
    if new.user_id is null or not pg_try_advisory_xact_lock(hashtextextended(new.user_id::text, 0)) then
      raise exception 'Another reminder for this customer is being processed.';
    end if;
    if old.reminder_result = 'sending' then
      if old.reminder_attempt_at is null or old.reminder_attempt_at > now() - interval '30 minutes'
        or old.recovery_token_hash is not null or old.reminder_provider_id is not null
        or exists (select 1 from public.notification_events e
          where e.event_key = 'cart:' || old.id::text || ':recovery' and e.channel = 'email'
            and (e.provider_message_id is not null or e.status in ('sent', 'delivered', 'read', 'uncertain'))) then
        raise exception 'The earlier delivery may have reached the provider and must be reviewed.';
      end if;
      update public.notification_events set status = 'failed',
        error = 'Previous claim expired before email preparation.', updated_at = now()
        where event_key = 'cart:' || old.id::text || ':recovery'
          and channel = 'email' and status = 'sending' and provider_message_id is null;
    elsif exists (select 1 from public.notification_events e
      where e.event_key = 'cart:' || old.id::text || ':recovery' and e.channel = 'email'
        and (e.provider_message_id is not null or e.status in ('sending', 'sent', 'delivered', 'read', 'uncertain'))) then
      raise exception 'The earlier delivery may have reached the provider and must be reviewed.';
    end if;
    if old.reminder_attempts >= 3 then
      raise exception 'The maximum number of reminder attempts has been reached.';
    end if;
    if not new.recovery_email_consent or exists (select 1 from public.cart_reminder_preferences p
      where p.user_id = new.user_id and (not p.opted_in or p.suppressed_at is not null)) then
      raise exception 'The customer has opted out or is suppressed.';
    end if;
    if exists (select 1 from public.abandoned_carts prior
      where prior.user_id = new.user_id and prior.id <> new.id
        and prior.reminder_result in ('sending', 'sent')
        and coalesce(prior.reminder_sent_at, prior.reminder_attempt_at) > now() - interval '24 hours') then
      raise exception 'Another cart reminder was sent or is processing within the last 24 hours.';
    end if;
    if exists (select 1 from public.product_reminders prior
      where prior.user_id = new.user_id and prior.status in ('sending', 'sent', 'uncertain')
        and (prior.status <> 'sending' or prior.cancel_reason is null)
        and coalesce(prior.sent_at, prior.attempted_at) > now() - interval '24 hours') then
      raise exception 'A product reminder was sent or is processing within the last 24 hours.';
    end if;
    if new.reminder_attempts = old.reminder_attempts then
      new.reminder_attempts := old.reminder_attempts + 1;
    end if;
    new.reminder_claim_activity_at := new.last_activity_at;
  elsif new.reminder_result is distinct from 'sending' and new.reminder_result is distinct from 'sent' then
    new.reminder_origin := 'automatic';
  end if;
  return new;
end $$;

create or replace function public.ajr_claim_cart_recovery_reminders(
  p_cutoff timestamptz, p_stale_before timestamptz, p_limit integer default 20
) returns table (
  id uuid, user_id uuid, customer_name text, customer_email text, customer_phone text,
  item_count integer, cart_items jsonb, whatsapp_marketing_consent boolean, attempt_at timestamptz
) language plpgsql security definer set search_path = public, pg_temp as $$
declare candidate public.abandoned_carts;
begin
  if p_cutoff is null or p_stale_before is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Invalid cart reminder claim request';
  end if;
  for candidate in
    select ac.* from public.abandoned_carts ac
    where ac.user_id is not null and ac.recovery_email_consent
      and nullif(trim(ac.customer_email), '') is not null
      and ac.item_count > 0 and jsonb_typeof(ac.cart_items) = 'array'
      and jsonb_array_length(ac.cart_items) > 0
      and ac.closed_at is null and ac.order_id is null and ac.reminder_sent_at is null
      and ac.last_activity_at <= p_cutoff and ac.reminder_attempts < 3
      and (ac.reminder_attempt_at is null
        or (ac.reminder_result = 'failed' and ac.reminder_attempt_at <= p_stale_before)
        or (ac.reminder_result = 'sending' and ac.reminder_attempt_at <= p_stale_before
          and ac.reminder_attempt_at <= now() - interval '30 minutes'
          and ac.recovery_token_hash is null and ac.reminder_provider_id is null))
    order by ac.last_activity_at
    for update skip locked
  loop
    if not pg_try_advisory_xact_lock(hashtextextended(candidate.user_id::text, 0)) then continue; end if;
    if exists (select 1 from public.notification_events e
      where e.event_key = 'cart:' || candidate.id::text || ':recovery' and e.channel = 'email'
        and (e.provider_message_id is not null or e.status in ('sent', 'delivered', 'read', 'uncertain')
          or (e.status = 'sending' and candidate.reminder_result is distinct from 'sending'))) then continue; end if;
    if exists (select 1 from public.cart_reminder_preferences p where p.user_id = candidate.user_id
      and (not p.opted_in or p.suppressed_at is not null)) then continue; end if;
    if exists (select 1 from public.abandoned_carts prior
      where prior.user_id = candidate.user_id and prior.id <> candidate.id
        and prior.reminder_result in ('sending', 'sent')
        and coalesce(prior.reminder_sent_at, prior.reminder_attempt_at) > now() - interval '24 hours') then continue; end if;
    if exists (select 1 from public.product_reminders prior
      where prior.user_id = candidate.user_id and prior.status in ('sending', 'sent', 'uncertain')
        and (prior.status <> 'sending' or prior.cancel_reason is null)
        and coalesce(prior.sent_at, prior.attempted_at) > now() - interval '24 hours') then continue; end if;
    update public.abandoned_carts ac set reminder_attempt_at = now(),
      reminder_attempts = ac.reminder_attempts + 1, reminder_result = 'sending',
      reminder_origin = 'automatic', reminder_error = null, reminder_provider_id = null, updated_at = now()
      where ac.id = candidate.id returning ac.* into candidate;
    id := candidate.id; user_id := candidate.user_id; customer_name := candidate.customer_name;
    customer_email := candidate.customer_email; customer_phone := candidate.customer_phone;
    item_count := candidate.item_count; cart_items := candidate.cart_items;
    whatsapp_marketing_consent := candidate.whatsapp_marketing_consent;
    attempt_at := candidate.reminder_attempt_at;
    return next;
    p_limit := p_limit - 1;
    if p_limit <= 0 then return; end if;
  end loop;
end $$;
revoke all on function public.ajr_claim_cart_recovery_reminders(timestamptz, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.ajr_claim_cart_recovery_reminders(timestamptz, timestamptz, integer) to service_role;

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
        and (c.reminder_origin = 'manual' or c.last_activity_at <= now() - interval '30 minutes')
        and c.last_activity_at = c.reminder_claim_activity_at
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

commit;
