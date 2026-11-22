-- Raju Traders notification event outbox and provider delivery receipts.
-- Run after customer-features.sql and abandoned-carts.sql.
create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  event_type text not null check (event_type in ('order_confirmation','abandoned_cart')),
  channel text not null check (channel in ('email','whatsapp','admin_email')),
  recipient text not null default '',
  payload jsonb not null default '{}'::jsonb,
  consent_recorded boolean not null default false,
  status text not null default 'queued' check (status in ('queued','sending','sent','delivered','failed','uncertain','skipped','read')),
  provider_message_id text,
  error text,
  retry_count integer not null default 0,
  attempted_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_key, channel)
);
create index if not exists notification_events_recent_idx on public.notification_events (created_at desc);
create unique index if not exists notification_events_provider_id_idx on public.notification_events (provider_message_id) where provider_message_id is not null;
alter table public.notification_events enable row level security;
revoke all on public.notification_events from public, anon, authenticated;
grant all on public.notification_events to service_role;

create table if not exists public.notification_receipts (
  id uuid primary key default gen_random_uuid(),
  provider_message_id text not null,
  provider text not null check (provider in ('meta','resend')),
  status text not null,
  received_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  unique (provider_message_id, status)
);
alter table public.notification_receipts enable row level security;
revoke all on public.notification_receipts from public, anon, authenticated;
grant all on public.notification_receipts to service_role;

alter table public.notification_events drop constraint if exists notification_events_status_check;
alter table public.notification_events add constraint notification_events_status_check
  check (status in ('queued','sending','sent','delivered','failed','uncertain','skipped','read'));
alter table public.notification_events add column if not exists attempted_at timestamptz;

-- One caller owns a delivery attempt. Only known provider rejections use the
-- retryable failed state; uncertain outcomes are never claimed again.
create or replace function public.ajr_claim_notification_event(
  p_event_key text, p_event_type text, p_channel text, p_recipient text,
  p_payload jsonb, p_consent boolean
) returns public.notification_events
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_event public.notification_events%rowtype;
begin
  insert into public.notification_events (event_key,event_type,channel,recipient,payload,consent_recorded,status)
    values (p_event_key,p_event_type,p_channel,p_recipient,coalesce(p_payload,'{}'::jsonb),p_consent,'queued')
    on conflict (event_key,channel) do nothing;
  update public.notification_events
    set status = 'sending', attempted_at = now(),
        retry_count = case when status = 'failed' then retry_count + 1 else retry_count end,
        updated_at = now(), error = null
    where event_key = p_event_key and channel = p_channel
      and (status = 'queued' or (status = 'failed' and provider_message_id is null and retry_count < 2))
    returning * into v_event;
  return v_event;
end;
$$;
revoke all on function public.ajr_claim_notification_event(text,text,text,text,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.ajr_claim_notification_event(text,text,text,text,jsonb,boolean) to service_role;
alter table public.abandoned_carts add column if not exists whatsapp_marketing_consent boolean not null default false;
alter table public.abandoned_carts add column if not exists whatsapp_marketing_consent_at timestamptz;
