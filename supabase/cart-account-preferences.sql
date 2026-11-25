-- Apply after cart-recovery-automation.sql. No existing preferences are changed.
begin;

create or replace function public.ajr_enable_cart_reminders(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare saved_user uuid;
begin
  if p_user_id is null or not exists (
    select 1 from auth.users u
    where u.id = p_user_id and u.email_confirmed_at is not null
      and nullif(trim(u.email), '') is not null
  ) then
    raise exception 'A verified account email is required.';
  end if;

  insert into public.cart_reminder_preferences
    (user_id, opted_in, opted_in_at, consent_source, consent_version, updated_at)
  values (p_user_id, true, now(), 'login', 'cart-reminders-v1', now())
  on conflict (user_id) do update
    set opted_in = true, opted_in_at = now(), consent_source = 'login',
      consent_version = 'cart-reminders-v1', updated_at = now()
    where public.cart_reminder_preferences.suppressed_at is null
  returning user_id into saved_user;

  if saved_user is null then
    raise exception 'Email delivery is suppressed. Please contact support.';
  end if;

  update public.abandoned_carts
    set recovery_email_consent = true, recovery_email_consent_at = now(), updated_at = now()
    where user_id = p_user_id and closed_at is null;
end $$;
revoke all on function public.ajr_enable_cart_reminders(uuid) from public, anon, authenticated;
grant execute on function public.ajr_enable_cart_reminders(uuid) to service_role;

commit;
