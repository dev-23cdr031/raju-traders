-- Apply after cart-manual-reminder.sql. Does not alter schedules or preferences.
begin;

create or replace function public.ajr_cart_customer_block(p_user_id uuid, p_cart_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with cart_blocks as (
    select case when e.status = 'uncertain' or (p.reminder_result is distinct from 'sent'
          and p.reminder_sent_at is null and
          (e.provider_message_id is not null or
            (p.reminder_result is distinct from 'sending' and e.status in ('sending','sent','delivered','read')))) then 'uncertain'
      when p.reminder_result = 'sending' then
        case when p.reminder_attempt_at > now() - interval '30 minutes'
          then 'processing' else 'uncertain' end
      else 'cooldown' end as reason,
      'cart'::text as campaign, p.reminder_result as status,
      p.reminder_attempt_at as attempted_at, p.reminder_sent_at as sent_at,
      case when p.reminder_result = 'sending' or e.status = 'uncertain'
        or (p.reminder_result is distinct from 'sent' and p.reminder_sent_at is null
          and (e.provider_message_id is not null or e.status in ('sending','sent','delivered','read'))) then null
        else coalesce(p.reminder_sent_at, p.reminder_attempt_at) + interval '24 hours' end as eligible_at,
      coalesce((select r.status from public.notification_receipts r
        where r.provider = 'resend' and r.provider_message_id = p.reminder_provider_id
        order by case r.status when 'email.complained' then 1 when 'email.bounced' then 2
          when 'email.suppressed' then 3 when 'email.failed' then 4 when 'email.delivered' then 5 else 6 end
        limit 1), e.status) as delivery_status
    from public.abandoned_carts p
    left join public.notification_events e on e.event_key = 'cart:' || p.id::text || ':recovery' and e.channel = 'email'
    where p.user_id = p_user_id and p.id <> p_cart_id and (
      (p.reminder_result = 'sending' and not (
        p.reminder_attempt_at is not null and p.reminder_attempt_at <= now() - interval '30 minutes'
        and p.reminder_sent_at is null and p.recovery_token_hash is null and p.reminder_provider_id is null
        and coalesce(e.provider_message_id is null and e.status not in ('sent','delivered','read','uncertain'), true)
      ))
      or ((p.reminder_result = 'sent' or p.reminder_sent_at is not null)
        and (coalesce(p.reminder_sent_at, p.reminder_attempt_at) is null
          or coalesce(p.reminder_sent_at, p.reminder_attempt_at) > now() - interval '24 hours'))
      or e.status = 'uncertain'
      or (p.reminder_result is distinct from 'sent' and p.reminder_sent_at is null
        and (e.provider_message_id is not null or
          (p.reminder_result is distinct from 'sending' and e.status in ('sending','sent','delivered','read'))))
    )
  ), product_blocks as (
    select case when p.status = 'sending' then 'processing'
      when p.status = 'uncertain' then 'uncertain' else 'cooldown' end as reason,
      'product'::text as campaign, p.status, p.attempted_at, p.sent_at,
      case when p.status = 'sent' then coalesce(p.sent_at,p.attempted_at) + interval '24 hours' else null end as eligible_at,
      null::text as delivery_status
    from public.product_reminders p
    where p.user_id = p_user_id and p.status in ('sending','sent','uncertain')
      and (p.status <> 'sending' or p.cancel_reason is null)
      and coalesce(p.sent_at,p.attempted_at) > now() - interval '24 hours'
  )
  select to_jsonb(b) from (select * from cart_blocks union all select * from product_blocks) b
  order by case b.reason when 'uncertain' then 0 when 'processing' then 1 else 2 end,
    b.eligible_at desc nulls first limit 1
$$;
revoke all on function public.ajr_cart_customer_block(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ajr_cart_customer_block(uuid, uuid) to service_role;

create or replace function public.ajr_reconcile_unprepared_cart_claims(p_user_id uuid, p_exclude uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare candidate public.abandoned_carts;
begin
  for candidate in
    select c.* from public.abandoned_carts c
    where c.user_id = p_user_id and c.id <> p_exclude and c.reminder_result = 'sending'
      and c.reminder_attempt_at <= now() - interval '30 minutes'
      and c.reminder_sent_at is null and c.recovery_token_hash is null and c.reminder_provider_id is null
      and not exists (select 1 from public.notification_events e
        where e.event_key = 'cart:' || c.id::text || ':recovery' and e.channel = 'email'
          and (e.provider_message_id is not null or e.status in ('sent','delivered','read','uncertain')))
    for update skip locked
  loop
    update public.notification_events set status = 'failed',
      error = 'Previous claim expired before email preparation.', updated_at = now()
      where event_key = 'cart:' || candidate.id::text || ':recovery'
        and channel = 'email' and status = 'sending' and provider_message_id is null;
    update public.abandoned_carts set reminder_result = 'failed',
      reminder_error = 'Previous claim expired before email preparation.', updated_at = now()
      where id = candidate.id and reminder_result = 'sending'
        and reminder_attempt_at = candidate.reminder_attempt_at
        and reminder_sent_at is null and recovery_token_hash is null and reminder_provider_id is null;
  end loop;
end $$;
revoke all on function public.ajr_reconcile_unprepared_cart_claims(uuid, uuid) from public, anon, authenticated;

create or replace function public.ajr_guard_cart_reminder_claim()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare blocker jsonb;
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
    perform public.ajr_reconcile_unprepared_cart_claims(new.user_id, new.id);
    blocker := public.ajr_cart_customer_block(new.user_id, new.id);
    if blocker is not null then
      if blocker->>'reason' = 'uncertain' then
        raise exception 'An earlier reminder has an uncertain delivery outcome and must be reviewed.';
      elsif blocker->>'reason' = 'processing' then
        raise exception 'Another reminder for this customer is being processed.';
      elsif blocker->>'campaign' = 'cart' then
        raise exception 'Another cart reminder was sent within the last 24 hours.';
      else
        raise exception 'A product reminder was sent within the last 24 hours.';
      end if;
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
    order by ac.last_activity_at for update skip locked
  loop
    if not pg_try_advisory_xact_lock(hashtextextended(candidate.user_id::text, 0)) then continue; end if;
    if exists (select 1 from public.notification_events e
      where e.event_key = 'cart:' || candidate.id::text || ':recovery' and e.channel = 'email'
        and (e.provider_message_id is not null or e.status in ('sent', 'delivered', 'read', 'uncertain')
          or (e.status = 'sending' and candidate.reminder_result is distinct from 'sending'))) then continue; end if;
    if exists (select 1 from public.cart_reminder_preferences p where p.user_id = candidate.user_id
      and (not p.opted_in or p.suppressed_at is not null)) then continue; end if;
    perform public.ajr_reconcile_unprepared_cart_claims(candidate.user_id, candidate.id);
    if public.ajr_cart_customer_block(candidate.user_id, candidate.id) is not null then continue; end if;
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

create or replace function public.ajr_cart_customer_diagnostics(p_cart_ids uuid[])
returns table (cart_id uuid, blocker jsonb, previous jsonb, previous_sent jsonb)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.id, public.ajr_cart_customer_block(c.user_id, c.id),
    (select jsonb_build_object('status', p.reminder_result, 'attempted_at', p.reminder_attempt_at,
      'sent_at', p.reminder_sent_at,
      'lock_status', case when p.reminder_result is distinct from 'sending' then null
        when p.reminder_attempt_at > now() - interval '30 minutes' then 'Processing'
        when p.reminder_attempt_at is not null and p.reminder_sent_at is null
          and p.recovery_token_hash is null and p.reminder_provider_id is null
          and coalesce(e.provider_message_id is null and e.status not in ('sent','delivered','read','uncertain'), true)
          then 'Expired before preparation; safe to reconcile on claim'
        else 'Uncertain; verify provider outcome' end,
      'delivery_status', coalesce(
        (select r.status from public.notification_receipts r
          where r.provider = 'resend' and r.provider_message_id = p.reminder_provider_id
          order by case r.status when 'email.complained' then 1 when 'email.bounced' then 2
            when 'email.suppressed' then 3 when 'email.failed' then 4 when 'email.delivered' then 5 else 6 end
          limit 1), e.status))
      from public.abandoned_carts p
      left join public.notification_events e on e.event_key = 'cart:' || p.id::text || ':recovery' and e.channel = 'email'
      where p.user_id = c.user_id and p.id <> c.id and
        (p.reminder_attempt_at is not null or p.reminder_sent_at is not null)
      order by coalesce(p.reminder_sent_at,p.reminder_attempt_at) desc nulls last limit 1),
    (select jsonb_build_object('status', p.reminder_result, 'attempted_at', p.reminder_attempt_at,
      'sent_at', p.reminder_sent_at, 'delivery_status', coalesce(
        (select r.status from public.notification_receipts r
          where r.provider = 'resend' and r.provider_message_id = p.reminder_provider_id
          order by case r.status when 'email.complained' then 1 when 'email.bounced' then 2
            when 'email.suppressed' then 3 when 'email.failed' then 4 when 'email.delivered' then 5 else 6 end
          limit 1), e.status))
      from public.abandoned_carts p
      left join public.notification_events e on e.event_key = 'cart:' || p.id::text || ':recovery' and e.channel = 'email'
      where p.user_id = c.user_id and p.id <> c.id
        and (p.reminder_result = 'sent' or p.reminder_sent_at is not null)
      order by coalesce(p.reminder_sent_at,p.reminder_attempt_at) desc nulls last limit 1)
  from public.abandoned_carts c where c.id = any(p_cart_ids)
$$;
revoke all on function public.ajr_cart_customer_diagnostics(uuid[]) from public, anon, authenticated;
grant execute on function public.ajr_cart_customer_diagnostics(uuid[]) to service_role;

commit;
