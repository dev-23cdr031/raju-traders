-- Login Users event history. Run manually in the Supabase SQL Editor.
-- Events begin only after this table exists and the corresponding app version
-- is deployed; Auth timestamps are never used to fabricate historical events.
create table if not exists public.auth_login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('login_success', 'login_failure', 'logout')),
  device text not null default 'Other' check (char_length(device) <= 24),
  browser text not null default 'Other' check (char_length(browser) <= 24),
  os text not null default 'Other' check (char_length(os) <= 24),
  login_method text not null default 'password' check (char_length(login_method) <= 24),
  session_ref uuid,
  created_at timestamptz not null default now()
);

create index if not exists auth_login_events_created_at_idx
  on public.auth_login_events (created_at desc);
create index if not exists auth_login_events_user_created_at_idx
  on public.auth_login_events (user_id, created_at desc)
  where user_id is not null;
create index if not exists auth_login_events_type_created_at_idx
  on public.auth_login_events (event_type, created_at desc);

alter table public.auth_login_events enable row level security;

-- No client-side role can read or write admin authentication audit data.
drop policy if exists "No client access to auth login events" on public.auth_login_events;
revoke all privileges on table public.auth_login_events from public, anon, authenticated;
grant select, insert on table public.auth_login_events to service_role;
