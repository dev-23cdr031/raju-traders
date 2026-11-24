-- Apply before deploying the assistant. The assistant starts disabled.
create table if not exists public.ai_assistant_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  welcome_message text not null default 'Welcome to Raju Traders. How can I help you shop?',
  daily_limit integer not null default 50 check (daily_limit between 0 and 1000),
  monthly_limit integer not null default 1000 check (monthly_limit between 0 and 30000),
  per_actor_minute_limit integer not null default 5 check (per_actor_minute_limit between 1 and 30),
  per_actor_daily_limit integer not null default 50 check (per_actor_daily_limit between 1 and 1000),
  daily_request_limit integer not null default 1000 check (daily_request_limit between 1 and 100000),
  updated_at timestamptz not null default now()
);
insert into public.ai_assistant_settings (id) values (true) on conflict do nothing;

create table if not exists public.ai_assistant_requests (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  actor_hash text not null check (actor_hash ~ '^[0-9a-f]{64}$'),
  user_hash text check (user_hash is null or user_hash ~ '^[0-9a-f]{64}$'),
  intent text not null check (intent in ('recommend', 'gift', 'offers', 'compare')),
  status text not null check (status in ('reserved', 'ai', 'fallback', 'failed')),
  product_ids bigint[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists ai_assistant_requests_created_idx on public.ai_assistant_requests (created_at desc);
create index if not exists ai_assistant_requests_actor_idx on public.ai_assistant_requests (actor_hash, created_at desc);
create index if not exists ai_assistant_requests_user_idx on public.ai_assistant_requests (user_hash, created_at desc) where user_hash is not null;
create index if not exists ai_assistant_requests_conversation_idx on public.ai_assistant_requests (conversation_id, created_at desc);

create table if not exists public.ai_assistant_faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null check (length(trim(question)) between 1 and 200),
  answer text not null check (length(trim(answer)) between 1 and 2000),
  published boolean not null default false,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists ai_assistant_faqs_public_idx on public.ai_assistant_faqs (sort_order, id) where published;

alter table public.ai_assistant_settings enable row level security;
alter table public.ai_assistant_requests enable row level security;
alter table public.ai_assistant_faqs enable row level security;
revoke all on public.ai_assistant_settings, public.ai_assistant_requests, public.ai_assistant_faqs from public, anon, authenticated;
grant select, update on public.ai_assistant_settings to service_role;
grant select, insert, update on public.ai_assistant_requests to service_role;
grant select, insert, update, delete on public.ai_assistant_faqs to service_role;

-- Serialize reservations across serverless instances. Count reserved and
-- failed attempts against the quota, as a timeout can still consume tokens.
create or replace function public.ajr_reserve_ai_assistant_request(
  p_actor_hash text, p_user_hash text, p_conversation_id uuid, p_intent text, p_attempt_ai boolean
) returns table (request_id uuid, allow_ai boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare cfg public.ai_assistant_settings; ai_day bigint; ai_month bigint;
begin
  if p_actor_hash is null or p_actor_hash !~ '^[0-9a-f]{64}$'
    or (p_user_hash is not null and p_user_hash !~ '^[0-9a-f]{64}$')
    or p_conversation_id is null or p_intent not in ('recommend', 'gift', 'offers', 'compare')
    or p_attempt_ai is null then
    raise exception 'Invalid assistant request';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ajr-ai-quota', 0));
  select * into strict cfg from public.ai_assistant_settings where id;
  if not cfg.enabled then raise exception 'Assistant disabled'; end if;
  delete from public.ai_assistant_requests where id in (
    select id from public.ai_assistant_requests where created_at < now() - interval '90 days'
    order by created_at limit 100
  );
  if (select count(*) from public.ai_assistant_requests
      where actor_hash = p_actor_hash and created_at >= now() - interval '1 minute') >= cfg.per_actor_minute_limit then
    raise exception 'Assistant rate limit exceeded';
  end if;
  if p_user_hash is not null and (select count(*) from public.ai_assistant_requests
      where user_hash = p_user_hash and created_at >= now() - interval '1 minute') >= cfg.per_actor_minute_limit then
    raise exception 'Assistant rate limit exceeded';
  end if;
  if (select count(*) from public.ai_assistant_requests
      where actor_hash = p_actor_hash and created_at >= now() - interval '24 hours') >= cfg.per_actor_daily_limit
    or (p_user_hash is not null and (select count(*) from public.ai_assistant_requests
      where user_hash = p_user_hash and created_at >= now() - interval '24 hours') >= cfg.per_actor_daily_limit)
    or (select count(*) from public.ai_assistant_requests
      where created_at >= now() - interval '24 hours') >= cfg.daily_request_limit then
    raise exception 'Assistant rate limit exceeded';
  end if;
  select count(*) filter (where created_at >= now() - interval '24 hours'),
         count(*) filter (where created_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC')
    into ai_day, ai_month from public.ai_assistant_requests
    where status in ('reserved', 'ai', 'failed')
      and created_at >= least(now() - interval '24 hours',
        date_trunc('month', now() at time zone 'UTC') at time zone 'UTC');
  allow_ai := p_attempt_ai and ai_day < cfg.daily_limit and ai_month < cfg.monthly_limit;
  insert into public.ai_assistant_requests(conversation_id, actor_hash, user_hash, intent, status)
    values (p_conversation_id, p_actor_hash, p_user_hash, p_intent, case when allow_ai then 'reserved' else 'fallback' end)
    returning id into request_id;
  return next;
end $$;
revoke all on function public.ajr_reserve_ai_assistant_request(text, text, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.ajr_reserve_ai_assistant_request(text, text, uuid, text, boolean) to service_role;

create or replace function public.ajr_ai_assistant_stats()
returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'conversations', (select count(distinct conversation_id) from public.ai_assistant_requests),
    'requests', (select count(*) from public.ai_assistant_requests),
    'ai_rankings', (select count(*) from public.ai_assistant_requests where status = 'ai'),
    'failed_ai_requests', (select count(*) from public.ai_assistant_requests where status = 'failed'),
    'daily_ai_attempts', (select count(*) from public.ai_assistant_requests where status in ('reserved','ai','failed') and created_at >= now() - interval '24 hours'),
    'monthly_ai_attempts', (select count(*) from public.ai_assistant_requests where status in ('reserved','ai','failed') and created_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'),
    'recent', coalesce((select jsonb_agg(item) from (
      select conversation_id, intent, status, product_ids, created_at
      from public.ai_assistant_requests order by created_at desc limit 30
    ) item), '[]'::jsonb),
    'popular_actions', coalesce((select jsonb_agg(item) from (
      select intent, count(*) as count from public.ai_assistant_requests
      group by intent order by count(*) desc
    ) item), '[]'::jsonb),
    'recommended_products', coalesce((select jsonb_agg(item) from (
      select p.id, p.name, count(*) as count
      from public.ai_assistant_requests r
      cross join lateral unnest(r.product_ids) as listed(product_id)
      join public.products p on p.id = listed.product_id
      group by p.id, p.name order by count(*) desc limit 10
    ) item), '[]'::jsonb)
  );
$$;
revoke all on function public.ajr_ai_assistant_stats() from public, anon, authenticated;
grant execute on function public.ajr_ai_assistant_stats() to service_role;
