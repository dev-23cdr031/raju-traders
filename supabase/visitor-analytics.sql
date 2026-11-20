-- Anonymous, first-party storefront analytics.
-- Events intentionally contain no IP address, user-agent string, referrer,
-- URL/query string, customer account id, form data, or order/payment details.
-- This schema does not install a database scheduler. For a finite event-history
-- retention period, schedule a monthly DELETE using the created_at index.
create table if not exists public.visitor_analytics_events (
  id bigint generated always as identity primary key,
  visitor_id uuid not null,
  session_id uuid not null,
  event_name text not null check (event_name in ('page_view', 'page_duration', 'cart_add', 'checkout_start', 'purchase', 'heartbeat')),
  page text not null check (page in ('home', 'about', 'shop', 'contact', 'cart', 'wishlist', 'product-detail', 'orders', 'login', 'signup')),
  product_id bigint check (product_id is null or product_id > 0),
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 900000),
  device_type text not null check (device_type in ('desktop', 'mobile', 'tablet')),
  browser text not null check (browser in ('Chrome', 'Safari', 'Firefox', 'Edge', 'Other')),
  operating_system text not null check (operating_system in ('Windows', 'macOS', 'iOS', 'Android', 'Linux', 'Other')),
  created_at timestamptz not null default now()
);

alter table public.visitor_analytics_events
  add column if not exists product_id bigint;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'visitor_analytics_events_product_id_check'
      and conrelid = 'public.visitor_analytics_events'::regclass
  ) then
    alter table public.visitor_analytics_events
      add constraint visitor_analytics_events_product_id_check
      check (product_id is null or product_id > 0);
  end if;
end;
$$;

create index if not exists visitor_analytics_events_created_at_idx
  on public.visitor_analytics_events (created_at desc);
create index if not exists visitor_analytics_events_visitor_created_at_idx
  on public.visitor_analytics_events (visitor_id, created_at desc);
create index if not exists visitor_analytics_events_session_created_at_idx
  on public.visitor_analytics_events (session_id, created_at desc);

alter table public.visitor_analytics_events enable row level security;
revoke all on table public.visitor_analytics_events from anon, authenticated;
grant select, insert on table public.visitor_analytics_events to service_role;
revoke all on sequence public.visitor_analytics_events_id_seq from anon, authenticated;
grant usage, select on sequence public.visitor_analytics_events_id_seq to service_role;

create or replace function public.visitor_analytics_summary(
  p_since timestamptz,
  p_until timestamptz
) returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with period_events as materialized (
    select visitor_id, session_id, event_name, page, product_id, duration_ms, device_type,
      browser, operating_system, created_at
    from public.visitor_analytics_events
    where created_at >= p_since and created_at < p_until
  ),
  period_visitors as (
    select visitor_id, count(distinct session_id) as sessions, max(created_at) as last_seen_at
    from period_events
    group by visitor_id
  ),
  page_rows as (
    select
      page,
      count(*) filter (where event_name = 'page_view') as views,
      count(distinct visitor_id) filter (where event_name = 'page_view') as unique_visitors,
      round(avg(duration_ms) filter (where event_name = 'page_duration'))::integer as average_duration_ms
    from period_events
    group by page
    having count(*) filter (where event_name = 'page_view') > 0
  ),
  product_rows as (
    select
      coalesce(products.name, 'Product') as name,
      count(*) as views,
      count(distinct events.visitor_id) as unique_visitors
    from period_events events
    left join public.products products on products.id = events.product_id
    where events.event_name = 'page_view'
      and events.page = 'product-detail'
      and events.product_id is not null
    group by events.product_id, products.name
  ),
  device_rows as (
    select device_type, browser, operating_system, count(distinct session_id) as sessions
    from period_events
    where event_name = 'page_view'
    group by device_type, browser, operating_system
  ),
  recent_rows as (
    select visitor_id, session_id, event_name, page, duration_ms, device_type,
      browser, operating_system, created_at
    from period_events
    where event_name <> 'heartbeat'
    order by created_at desc
    limit 200
  ),
  visitor_activity_rows as (
    select * from (
      select distinct on (visitor_id)
        visitor_id, session_id, event_name, page, duration_ms, device_type,
        browser, operating_system, created_at
      from period_events
      where event_name <> 'heartbeat'
      order by visitor_id, created_at desc
    ) latest_visitors
    order by created_at desc
    limit 200
  ),
  visitor_stats as (
    select
      pv.visitor_id,
      count(*) filter (where pe.event_name <> 'heartbeat') as events,
      coalesce((
        select sum(page_duration.duration_ms)
        from period_events page_duration
        where page_duration.visitor_id = pv.visitor_id
          and page_duration.session_id = activity.session_id
          and page_duration.page = activity.page
          and page_duration.event_name = 'page_duration'
      ), 0)::bigint as time_spent_ms,
      exists (
        select 1 from public.visitor_analytics_events previous
        where previous.visitor_id = pv.visitor_id and previous.created_at < p_since
      ) as has_prior_activity,
      exists (
        select 1 from public.visitor_analytics_events recent
        where recent.visitor_id = pv.visitor_id and recent.created_at >= now() - interval '5 minutes'
      ) as is_online
    from period_visitors pv
    join period_events pe on pe.visitor_id = pv.visitor_id
    join visitor_activity_rows activity on activity.visitor_id = pv.visitor_id
    group by pv.visitor_id, activity.session_id, activity.page
  )
  select jsonb_build_object(
    'metrics', jsonb_build_object(
      'visitors', (select count(*) from period_visitors),
      'pageViews', (select count(*) from period_events where event_name = 'page_view'),
      'newVisitors', (
        select count(*)
        from period_visitors pv
        where not exists (
          select 1 from public.visitor_analytics_events previous
          where previous.visitor_id = pv.visitor_id and previous.created_at < p_since
        )
      ),
      'returningVisitors', (
        select count(*)
        from period_visitors pv
        where exists (
          select 1 from public.visitor_analytics_events previous
          where previous.visitor_id = pv.visitor_id and previous.created_at < p_since
        )
      ),
      'todayVisitors', (
        select count(distinct visitor_id)
        from public.visitor_analytics_events
        where created_at >= (date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')
          and created_at < now()
      ),
      'onlineNow', (
        select count(distinct visitor_id)
        from public.visitor_analytics_events
        where created_at >= now() - interval '5 minutes'
      ),
      'weekVisitors', (
        select count(distinct visitor_id)
        from public.visitor_analytics_events
        where created_at >= now() - interval '7 days'
      ),
      'monthVisitors', (
        select count(distinct visitor_id)
        from public.visitor_analytics_events
        where created_at >= now() - interval '30 days'
      )
    ),
    'pages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'page', page,
        'views', views,
        'uniqueVisitors', unique_visitors,
        'averageDurationMs', average_duration_ms
      ) order by views desc, page asc)
      from page_rows
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', name,
        'views', views,
        'uniqueVisitors', unique_visitors
      ) order by views desc, name asc)
      from (select * from product_rows order by views desc, name asc limit 10) top_products
    ), '[]'::jsonb),
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'device', device_type,
        'browser', browser,
        'operatingSystem', operating_system,
        'sessions', sessions
      ) order by sessions desc, device_type asc)
      from device_rows
    ), '[]'::jsonb),
    'visitors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'visitorId', activity.visitor_id,
        'sessionId', activity.session_id,
        'eventName', activity.event_name,
        'page', activity.page,
        'durationMs', stats.time_spent_ms,
        'deviceType', activity.device_type,
        'browser', activity.browser,
        'operatingSystem', activity.operating_system,
        'createdAt', activity.created_at,
        'events', stats.events,
        'visitorType', case when stats.has_prior_activity then 'Returning' else 'New' end,
        'status', case when stats.is_online then 'Online' else 'Offline' end
      ) order by activity.created_at desc)
      from visitor_activity_rows activity
      join visitor_stats stats using (visitor_id)
    ), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(jsonb_build_object(
        'visitorId', visitor_id,
        'sessionId', session_id,
        'eventName', event_name,
        'page', page,
        'durationMs', duration_ms,
        'deviceType', device_type,
        'browser', browser,
        'operatingSystem', operating_system,
        'createdAt', created_at
      ) order by created_at desc)
      from recent_rows
    ), '[]'::jsonb),
    'updatedAt', now()
  )
$$;

revoke all on function public.visitor_analytics_summary(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.visitor_analytics_summary(timestamptz, timestamptz) to service_role;
