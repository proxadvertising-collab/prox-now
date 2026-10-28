-- Shop Book v1. This file is not applied by the app or by tests.
-- Apply it only after the captain writes apply.
--
-- Every business gets a public, swipeable "book": cover, hours, storefront,
-- logo, menu pages. Photos are stored by the server only, after face blur.
-- Clients cannot insert or update any of these tables directly.
-- Translations are cached per page and language.

-- shop_books -----------------------------------------------------------------

create table if not exists public.shop_books (
  shop_id uuid primary key references public.shops (id) on delete cascade,
  status text not null default 'live' check (status in ('live', 'hidden')),
  tagline text check (tagline is null or char_length(tagline) <= 80),
  theme jsonb not null default '{}'::jsonb,
  hours jsonb not null default '{}'::jsonb,
  source_language text
    check (source_language is null or source_language ~ '^[a-z]{2,3}(-[A-Za-z]{2,4})?$'),
  built_by_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shop_books_json_check check (
    jsonb_typeof(theme) = 'object' and pg_column_size(theme) <= 2048
    and jsonb_typeof(hours) = 'object' and pg_column_size(hours) <= 4096
  )
);

alter table public.shop_books enable row level security;

drop policy if exists shop_books_select_live_anon on public.shop_books;
create policy shop_books_select_live_anon
  on public.shop_books for select to anon
  using (status = 'live');

drop policy if exists shop_books_select_live_or_owner on public.shop_books;
create policy shop_books_select_live_or_owner
  on public.shop_books for select to authenticated
  using (status = 'live' or public.is_verified_owner(shop_id));

revoke all on table public.shop_books from public, anon, authenticated;
grant select on table public.shop_books to anon, authenticated;

-- shop_book_pages ------------------------------------------------------------

create table if not exists public.shop_book_pages (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  kind text not null check (kind in ('storefront', 'logo', 'hours', 'menu', 'qr', 'other')),
  position integer not null default 0 check (position between 0 and 99),
  image_path text not null check (char_length(image_path) between 5 and 200),
  width integer check (width is null or width between 1 and 4000),
  height integer check (height is null or height between 1 and 4000),
  status text not null default 'live' check (status in ('live', 'removed')),
  contributed_by uuid references public.profiles (id) on delete set null,
  batch_id uuid,
  language text
    check (language is null or language ~ '^[a-z]{2,3}(-[A-Za-z]{2,4})?$'),
  -- What Muse Spark read from the page: { section, items: [{name, price, currency, note}] }
  extracted jsonb not null default '{}'::jsonb,
  -- What really happened: { model, latency_ms, images_in_call, call_id }. Never hardcoded.
  ai_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references auth.users (id) on delete set null,
  constraint shop_book_pages_json_check check (
    jsonb_typeof(extracted) = 'object' and pg_column_size(extracted) <= 16384
    and jsonb_typeof(ai_meta) = 'object' and pg_column_size(ai_meta) <= 2048
  )
);

alter table public.shop_book_pages enable row level security;

-- One live page per single-page kind. Menu and other pages can be many.
create unique index if not exists shop_book_pages_one_live_single_idx
  on public.shop_book_pages (shop_id, kind)
  where status = 'live' and kind in ('storefront', 'logo', 'hours', 'qr');

create index if not exists shop_book_pages_shop_idx
  on public.shop_book_pages (shop_id, status, kind, position);

drop policy if exists shop_book_pages_select_live_anon on public.shop_book_pages;
create policy shop_book_pages_select_live_anon
  on public.shop_book_pages for select to anon
  using (
    status = 'live'
    and exists (select 1 from public.shop_books b where b.shop_id = shop_book_pages.shop_id and b.status = 'live')
  );

drop policy if exists shop_book_pages_select_auth on public.shop_book_pages;
create policy shop_book_pages_select_auth
  on public.shop_book_pages for select to authenticated
  using (
    (status = 'live'
      and exists (select 1 from public.shop_books b where b.shop_id = shop_book_pages.shop_id and b.status = 'live'))
    or contributed_by = (select auth.uid())
    or public.is_verified_owner(shop_id)
  );

revoke all on table public.shop_book_pages from public, anon, authenticated;
grant select on table public.shop_book_pages to anon, authenticated;

-- shop_book_translations (cache) ---------------------------------------------

create table if not exists public.shop_book_translations (
  page_id uuid not null references public.shop_book_pages (id) on delete cascade,
  lang text not null check (lang ~ '^[a-z]{2,3}(-[A-Za-z]{2,4})?$'),
  -- Same shape as extracted, translated. Prices are copied, never translated.
  extracted jsonb not null,
  -- sha256 of the source extracted json. A changed page misses the cache.
  source_hash text not null check (char_length(source_hash) = 64),
  model text,
  created_at timestamptz not null default now(),
  primary key (page_id, lang),
  constraint shop_book_translations_json_check
    check (jsonb_typeof(extracted) = 'object' and pg_column_size(extracted) <= 16384)
);

alter table public.shop_book_translations enable row level security;

drop policy if exists shop_book_translations_select_live on public.shop_book_translations;
create policy shop_book_translations_select_live
  on public.shop_book_translations for select to anon, authenticated
  using (
    exists (
      select 1 from public.shop_book_pages p
      where p.id = shop_book_translations.page_id and p.status = 'live'
    )
  );

revoke all on table public.shop_book_translations from public, anon, authenticated;
grant select on table public.shop_book_translations to anon, authenticated;

-- storage: bucket for book images (server writes with the service role) --------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shop-book', 'shop-book', true, 1048576, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists shop_book_select_anon on storage.objects;
create policy shop_book_select_anon
  on storage.objects for select to anon
  using (bucket_id = 'shop-book');

drop policy if exists shop_book_select_authenticated on storage.objects;
create policy shop_book_select_authenticated
  on storage.objects for select to authenticated
  using (bucket_id = 'shop-book');

-- No insert, update or delete policy: only the server (service role) writes.

-- functions ------------------------------------------------------------------

-- What is still missing for a place. Each item disappears once a live page exists.
-- Food kinds also need a menu. After place kinds ship, this skips public places.
create or replace function public.book_missing(p_shop_id uuid)
returns text[]
language sql
stable
set search_path = public
as $$
  select array_remove(array[
    case when not exists (select 1 from public.shop_book_pages p where p.shop_id = s.id and p.status = 'live' and p.kind = 'storefront') then 'storefront' end,
    case when not exists (select 1 from public.shop_book_pages p where p.shop_id = s.id and p.status = 'live' and p.kind = 'logo') then 'logo' end,
    case when not exists (select 1 from public.shop_book_pages p where p.shop_id = s.id and p.status = 'live' and p.kind = 'hours')
          and coalesce((select b.hours from public.shop_books b where b.shop_id = s.id), '{}'::jsonb) = '{}'::jsonb then 'hours' end,
    case when s.category in ('street_food', 'drinks', 'restaurant', 'fruit')
          and not exists (select 1 from public.shop_book_pages p where p.shop_id = s.id and p.status = 'live' and p.kind = 'menu') then 'menu' end,
    case when not exists (select 1 from public.shop_book_pages p where p.shop_id = s.id and p.status = 'live' and p.kind = 'qr') then 'qr' end
  ], null)
  from public.shops s
  where s.id = p_shop_id;
$$;

revoke all on function public.book_missing(uuid) from public;
grant execute on function public.book_missing(uuid) to anon, authenticated;

-- The whole public book in one read. Photographer shows a display name or nothing.
create or replace function public.book_public(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'shop', jsonb_build_object(
      'id', s.id, 'slug', s.slug, 'name', s.name, 'name_local', s.name_local,
      'category', s.category, 'timezone', s.timezone, 'currency', s.currency,
      'claimed', s.claimed, 'lat', s.lat, 'lng', s.lng
    ),
    'book', jsonb_build_object(
      'tagline', b.tagline, 'theme', b.theme, 'hours', b.hours,
      'source_language', b.source_language, 'built_by_model', b.built_by_model
    ),
    'pages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'kind', p.kind, 'position', p.position, 'image_path', p.image_path,
        'width', p.width, 'height', p.height, 'language', p.language,
        'extracted', p.extracted, 'ai_meta', p.ai_meta,
        'credit', (select pr.display_name from public.profiles pr where pr.id = p.contributed_by),
        'created_at', p.created_at
      ) order by
        case p.kind when 'storefront' then 0 when 'logo' then 1 when 'hours' then 2 when 'menu' then 3 else 4 end,
        p.position, p.created_at)
      from public.shop_book_pages p
      where p.shop_id = s.id and p.status = 'live'
    ), '[]'::jsonb),
    'missing', public.book_missing(s.id)
  )
  from public.shops s
  join public.shop_books b on b.shop_id = s.id and b.status = 'live'
  where s.slug = p_slug;
$$;

revoke all on function public.book_public(text) from public;
grant execute on function public.book_public(text) to anon, authenticated;

-- Remove a page: the verified owner at any time, the contributor within 24 hours.
-- Returns the storage path so the server can delete the file.
create or replace function public.book_remove_page(p_page_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_page public.shop_book_pages%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;

  select * into v_page from public.shop_book_pages where id = p_page_id and status = 'live' for update;
  if not found then
    raise exception 'not_found';
  end if;

  if not (
    public.is_verified_owner(v_page.shop_id)
    or (v_page.contributed_by = auth.uid() and v_page.created_at > now() - interval '24 hours')
  ) then
    raise exception 'not_allowed';
  end if;

  update public.shop_book_pages
  set status = 'removed', removed_at = now(), removed_by = auth.uid()
  where id = p_page_id;

  return v_page.image_path;
end;
$$;

revoke all on function public.book_remove_page(uuid) from public, anon;
grant execute on function public.book_remove_page(uuid) to authenticated;

-- Owner fixes the hours the AI read, or hides the whole book.
create or replace function public.book_owner_update(
  p_shop_id uuid,
  p_hours jsonb default null,
  p_status text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  if not public.is_verified_owner(p_shop_id) then
    raise exception 'not_allowed';
  end if;
  if p_status is not null and p_status not in ('live', 'hidden') then
    raise exception 'bad_status';
  end if;
  if p_hours is not null and (jsonb_typeof(p_hours) <> 'object' or pg_column_size(p_hours) > 4096) then
    raise exception 'bad_hours';
  end if;

  update public.shop_books
  set hours = coalesce(p_hours, hours),
      status = coalesce(p_status, status),
      updated_at = now()
  where shop_id = p_shop_id;

  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

revoke all on function public.book_owner_update(uuid, jsonb, text) from public, anon;
grant execute on function public.book_owner_update(uuid, jsonb, text) to authenticated;
