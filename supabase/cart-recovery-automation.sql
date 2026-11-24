-- Apply after customer-features.sql, abandoned-carts.sql,
-- notification-automation.sql and product-reminders.sql, before the app.
create table if not exists public.cart_reminder_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  opted_in boolean not null default false,
  opted_in_at timestamptz,
  opted_out_at timestamptz,
  suppressed_at timestamptz,
  suppression_reason text,
  consent_source text,
  consent_version text,
  updated_at timestamptz not null default now()
);
alter table public.cart_reminder_preferences enable row level security;
revoke all on public.cart_reminder_preferences from public, anon, authenticated;
grant select, insert, update on public.cart_reminder_preferences to service_role;

create or replace function public.ajr_signup_cart_marketing_preference()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.raw_user_meta_data -> 'cart_marketing_consent' = 'true'::jsonb then
    insert into public.cart_reminder_preferences
      (user_id, opted_in, opted_in_at, consent_source, consent_version)
    values (new.id, true, now(), 'signup', 'product-and-cart-v2')
    on conflict (user_id) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.ajr_signup_cart_marketing_preference() from public, anon, authenticated;
drop trigger if exists ajr_signup_cart_marketing_preference on auth.users;
create trigger ajr_signup_cart_marketing_preference after insert on auth.users
for each row execute function public.ajr_signup_cart_marketing_preference();

-- A saved account preference applies to new bags, not to anonymous carts.
create or replace function public.ajr_cart_preference_on_insert()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare pref public.cart_reminder_preferences;
begin
  if new.user_id is null then return new; end if;
  select * into pref from public.cart_reminder_preferences where user_id = new.user_id;
  if found then
    if pref.opted_in and pref.suppressed_at is null then
      new.recovery_email_consent := true;
      new.recovery_email_consent_at := pref.opted_in_at;
    else
      new.recovery_email_consent := false;
      new.recovery_email_consent_at := null;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.ajr_cart_preference_on_insert() from public, anon, authenticated;
drop trigger if exists ajr_cart_preference_on_insert on public.abandoned_carts;
create trigger ajr_cart_preference_on_insert before insert on public.abandoned_carts
for each row execute function public.ajr_cart_preference_on_insert();

create or replace function public.ajr_unsubscribe_cart_reminders(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_user_id is null then raise exception 'Missing customer'; end if;
  insert into public.cart_reminder_preferences(user_id, opted_in, opted_out_at)
    values (p_user_id, false, now())
    on conflict (user_id) do update set opted_in = false, opted_out_at = now(), updated_at = now();
  update public.abandoned_carts set recovery_email_consent = false,
    recovery_email_consent_at = null, updated_at = now()
    where user_id = p_user_id and closed_at is null;
end $$;
revoke all on function public.ajr_unsubscribe_cart_reminders(uuid) from public, anon, authenticated;
grant execute on function public.ajr_unsubscribe_cart_reminders(uuid) to service_role;

alter table public.abandoned_carts add column if not exists reminder_attempts integer not null default 0;
create index if not exists abandoned_carts_user_reminder_history_idx
  on public.abandoned_carts(user_id, reminder_sent_at desc, reminder_attempt_at desc);

create or replace function public.ajr_defer_cart_reminder_on_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' or new.items is distinct from old.items then
    update public.abandoned_carts set last_activity_at = now(), updated_at = now()
      where user_id = new.user_id and closed_at is null;
  end if;
  return new;
end $$;
revoke all on function public.ajr_defer_cart_reminder_on_change() from public, anon, authenticated;
drop trigger if exists ajr_defer_cart_reminder_on_change on public.carts;
create trigger ajr_defer_cart_reminder_on_change after insert or update of items on public.carts
for each row execute function public.ajr_defer_cart_reminder_on_change();

-- The legacy manual route must obey the same account-wide limit and opt-out.
create or replace function public.ajr_guard_cart_reminder_claim()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.reminder_result = 'sending' and old.reminder_result is distinct from 'sending' then
    if new.user_id is null or not pg_try_advisory_xact_lock(hashtextextended(new.user_id::text, 0)) then
      raise exception 'Cart reminder claim unavailable';
    end if;
    if old.reminder_attempts >= 3 or not new.recovery_email_consent or exists (select 1 from public.cart_reminder_preferences p
      where p.user_id = new.user_id and (not p.opted_in or p.suppressed_at is not null))
      or exists (select 1 from public.abandoned_carts prior
        where prior.user_id = new.user_id and prior.id <> new.id
          and prior.reminder_result in ('sending', 'sent')
          and coalesce(prior.reminder_sent_at, prior.reminder_attempt_at) > now() - interval '24 hours')
      or exists (select 1 from public.product_reminders prior
        where prior.user_id = new.user_id and prior.status in ('sending', 'sent', 'uncertain')
          and (prior.status <> 'sending' or prior.cancel_reason is null)
          and coalesce(prior.sent_at, prior.attempted_at) > now() - interval '24 hours') then
      raise exception 'Cart reminder is not eligible';
    end if;
    if new.reminder_attempts = old.reminder_attempts then
      new.reminder_attempts := old.reminder_attempts + 1;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.ajr_guard_cart_reminder_claim() from public, anon, authenticated;
drop trigger if exists ajr_guard_cart_reminder_claim on public.abandoned_carts;
create trigger ajr_guard_cart_reminder_claim before update of reminder_result on public.abandoned_carts
for each row execute function public.ajr_guard_cart_reminder_claim();

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
          and ac.recovery_token_hash is null and ac.reminder_provider_id is null))
    order by ac.last_activity_at
    for update skip locked
  loop
    if not pg_try_advisory_xact_lock(hashtextextended(candidate.user_id::text, 0)) then continue; end if;
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
      reminder_error = null, reminder_provider_id = null, updated_at = now()
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

create or replace function public.ajr_apply_cart_reminder_receipt(p_provider_id text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare target_user uuid; reason text;
begin
  select ac.user_id into target_user from public.abandoned_carts ac
  where ac.reminder_provider_id = p_provider_id limit 1;
  if target_user is null then
    select pr.user_id into target_user from public.product_reminders pr
    where pr.provider_message_id = p_provider_id limit 1;
  end if;
  if target_user is null then return; end if;
  select r.status into reason from public.notification_receipts r
    where r.provider = 'resend' and r.provider_message_id = p_provider_id
      and r.status in ('email.bounced', 'email.complained', 'email.suppressed')
    order by case r.status when 'email.complained' then 1 when 'email.bounced' then 2 else 3 end limit 1;
  if reason is null then return; end if;
  insert into public.cart_reminder_preferences(user_id, opted_in, suppressed_at, suppression_reason)
    values (target_user, false, now(), reason)
    on conflict (user_id) do update set opted_in = false, suppressed_at = now(),
      suppression_reason = reason, updated_at = now();
  insert into public.product_reminder_preferences(user_id, opted_in, suppressed_at, suppression_reason)
    values (target_user, false, now(), reason)
    on conflict (user_id) do update set opted_in = false, suppressed_at = now(),
      suppression_reason = reason, updated_at = now();
  update public.abandoned_carts set recovery_email_consent = false, updated_at = now()
    where user_id = target_user and closed_at is null;
  update public.product_reminders set status = 'cancelled', cancel_reason = reason, updated_at = now()
    where user_id = target_user and status = 'pending';
end $$;
revoke all on function public.ajr_apply_cart_reminder_receipt(text) from public, anon, authenticated;
grant execute on function public.ajr_apply_cart_reminder_receipt(text) to service_role;
create or replace function public.ajr_cart_receipt_trigger()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_table_name = 'abandoned_carts' then
    perform public.ajr_apply_cart_reminder_receipt(new.reminder_provider_id);
  else
    perform public.ajr_apply_cart_reminder_receipt(new.provider_message_id);
  end if;
  return new;
end $$;
revoke all on function public.ajr_cart_receipt_trigger() from public, anon, authenticated;
drop trigger if exists ajr_cart_receipt on public.notification_receipts;
create trigger ajr_cart_receipt after insert on public.notification_receipts
for each row execute function public.ajr_cart_receipt_trigger();
drop trigger if exists ajr_cart_receipt_reconcile on public.abandoned_carts;
create trigger ajr_cart_receipt_reconcile after update of reminder_provider_id on public.abandoned_carts
for each row when (new.reminder_provider_id is not null)
execute function public.ajr_cart_receipt_trigger();
drop trigger if exists ajr_cart_product_receipt_reconcile on public.product_reminders;
create trigger ajr_cart_product_receipt_reconcile after update of provider_message_id on public.product_reminders
for each row when (new.provider_message_id is not null)
execute function public.ajr_cart_receipt_trigger();
