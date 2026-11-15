-- AJR store branding settings
-- Run once in Supabase → SQL Editor → New query → Run.
-- The service-role API is the only route that can read or update this table.

create table if not exists public.store_settings (
  id smallint primary key default 1 check (id = 1),
  shop_name text not null default 'AJR',
  tagline text not null default 'ALWAYS JUST ROYAL',
  logo_url text not null default '/ajr-logo.png',
  updated_at timestamptz not null default now()
);

alter table public.store_settings enable row level security;

create or replace function public.touch_store_settings_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_store_settings_touch on public.store_settings;
create trigger trg_store_settings_touch
before update on public.store_settings
for each row execute function public.touch_store_settings_updated_at();

insert into public.store_settings (id, shop_name, tagline, logo_url)
values (1, 'AJR', 'ALWAYS JUST ROYAL', '/ajr-logo.png')
on conflict (id) do nothing;

-- No anon/authenticated policies are created. Row Level Security remains on;
-- only the server-side service role used by /api/settings can access this row.
