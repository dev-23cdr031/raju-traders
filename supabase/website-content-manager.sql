-- AJR Website Content Manager.
-- Apply after schema.sql, customer-features.sql, and the existing product migrations.
-- Existing storefront copy remains the fallback; no existing product/content rows are replaced.

alter table public.products add column if not exists benefits text[] not null default '{}';
alter table public.products add column if not exists ingredients text[] not null default '{}';
alter table public.products add column if not exists seo_title text not null default '';
alter table public.products add column if not exists seo_description text not null default '';

-- Product mutations are performed through authenticated server routes using the service role.
-- Do not let public/ordinary authenticated clients change inventory or CMS product content.
drop policy if exists "Allow product inserts" on public.products;
drop policy if exists "Allow product updates" on public.products;
drop policy if exists "Allow product deletes" on public.products;
revoke insert, update, delete on public.products from anon, authenticated;
grant select on public.products to anon, authenticated;

create table if not exists public.site_content (
  id smallint primary key default 1 check (id = 1),
  draft jsonb not null default '{}'::jsonb,
  published jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz,
  updated_by text not null default '',
  published_by text not null default '',
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.cms_banners (
  id uuid primary key default gen_random_uuid(),
  draft_data jsonb not null default '{}'::jsonb,
  published_data jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'scheduled', 'archived')),
  scheduled_at timestamptz,
  starts_at timestamptz,
  expires_at timestamptz,
  sort_order integer not null default 0,
  updated_by text not null default '',
  published_by text not null default '',
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint cms_banners_dates_ordered check (expires_at is null or starts_at is null or expires_at > starts_at)
);

create table if not exists public.cms_recipes (
  id uuid primary key default gen_random_uuid(),
  draft_data jsonb not null default '{}'::jsonb,
  published_data jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  sort_order integer not null default 0,
  updated_by text not null default '',
  published_by text not null default '',
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.cms_media (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  public_url text not null unique,
  original_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 5242880),
  alt_text text not null default '',
  category text not null default 'general',
  uploaded_by text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.cms_content_versions (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('site_content', 'banner', 'recipe')),
  entity_id text not null,
  snapshot jsonb not null,
  status text not null,
  action text not null,
  admin_email text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.cms_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('content_manager', 'editor', 'viewer')),
  assigned_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cms_banners_status_order_idx on public.cms_banners (status, sort_order, updated_at desc);
create index if not exists cms_banners_schedule_idx on public.cms_banners (scheduled_at) where status = 'scheduled';
create index if not exists cms_recipes_status_order_idx on public.cms_recipes (status, sort_order, updated_at desc);
create index if not exists cms_versions_entity_date_idx on public.cms_content_versions (entity_type, entity_id, created_at desc);
create index if not exists cms_media_category_date_idx on public.cms_media (category, created_at desc);
create index if not exists cms_user_roles_email_idx on public.cms_user_roles (lower(email));

alter table public.site_content enable row level security;
alter table public.cms_banners enable row level security;
alter table public.cms_recipes enable row level security;
alter table public.cms_media enable row level security;
alter table public.cms_content_versions enable row level security;
alter table public.cms_user_roles enable row level security;

revoke all on public.site_content, public.cms_banners, public.cms_recipes,
  public.cms_media, public.cms_content_versions, public.cms_user_roles
  from public, anon, authenticated;
grant all on public.site_content, public.cms_banners, public.cms_recipes,
  public.cms_media, public.cms_content_versions, public.cms_user_roles to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('website-media', 'website-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Public can read website media" on storage.objects;
create policy "Public can read website media"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'website-media');

create or replace function public.cms_publish_due_content()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_content public.site_content%rowtype;
  v_banner public.cms_banners%rowtype;
begin
  select * into v_content from public.site_content where id = 1 for update;
  if found and v_content.scheduled_at is not null and v_content.scheduled_at <= now() then
    insert into public.cms_content_versions (entity_type, entity_id, snapshot, status, action, admin_email)
    values ('site_content', '1', v_content.published, 'published', 'before-scheduled-publish', v_content.published_by);
    update public.site_content set
      published = draft,
      published_at = now(),
      published_by = 'Scheduled publication',
      scheduled_at = null,
      updated_at = now()
    where id = 1;
  end if;

  for v_banner in
    select * from public.cms_banners
    where status = 'scheduled' and scheduled_at is not null and scheduled_at <= now()
    for update
  loop
    insert into public.cms_content_versions (entity_type, entity_id, snapshot, status, action, admin_email)
    values ('banner', v_banner.id::text, v_banner.published_data, 'published', 'before-scheduled-publish', v_banner.published_by);
    update public.cms_banners set
      published_data = draft_data,
      status = 'published',
      published_at = now(),
      published_by = 'Scheduled publication',
      scheduled_at = null,
      updated_at = now()
    where id = v_banner.id;
  end loop;
end;
$$;

revoke all on function public.cms_publish_due_content() from public, anon, authenticated;
grant execute on function public.cms_publish_due_content() to service_role;
