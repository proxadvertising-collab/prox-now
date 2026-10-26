-- Prox Now core schema. This file is not applied by the app or by tests.
-- Apply it only after the captain writes apply. See supabase/README.md.
--
-- country_code, timezone, and currency default to the launch market only.
-- A shop in another country sets its own values. Nothing else here assumes one country.
-- Demo rows live in supabase/seeds and are not loaded by a database reset.
-- Storage buckets are not created here.
--
-- Safe to re-run: missing tables are created, and policies and triggers are replaced.
-- A table that already exists is left as it is.

-- profiles -------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  locale text not null default 'en' check (locale ~ '^[a-z]{2,3}(-[A-Za-z]{2,4})?$'),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Public display of a photographer name comes later, through a view or a
-- security-definer function. Until then a person can read only their own row.

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_profile_for_new_user on auth.users;
create trigger create_profile_for_new_user
  after insert on auth.users
  for each row
  execute function public.create_profile_for_new_user();

-- shops ----------------------------------------------------------------------

create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  -- Name in the shop's own script, for example Thai. Optional.
  name_local text,
  category text not null check (category in (
    'street_food', 'drinks', 'restaurant', 'fruit',
    'laundry', 'home_services', 'barber', 'other'
  )),
  lat double precision not null,
  lng double precision not null,
  -- Launch-market defaults only. Not a product-wide assumption.
  country_code text not null default 'TH' check (country_code ~ '^[A-Z]{2}$'),
  timezone text not null default 'Asia/Bangkok',
  currency text not null default 'THB' check (currency ~ '^[A-Z]{3}$'),
  address_hint text,
  phone_public text,
  is_demo boolean not null default false,
  claimed boolean not null default false,
  created_at timestamptz not null default now(),
  constraint shops_lat_range check (lat between -90 and 90),
  constraint shops_lng_range check (lng between -180 and 180)
);

alter table public.shops enable row level security;

-- shop owners and claim codes ------------------------------------------------

create table if not exists public.shop_owners (
  shop_id uuid references public.shops (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  created_at timestamptz not null default now(),
  primary key (shop_id, user_id)
);

alter table public.shop_owners enable row level security;

-- The one-time claim code is not a column on shop_owners.
-- A column privilege would make an ordinary select of the owner row fail.
-- This separate table is the smaller safe choice: row level security is on,
-- and there are no policies, so browser roles cannot read code_hash.
-- A server route that bypasses row level security writes and checks the hash.

create table if not exists public.shop_claim_codes (
  shop_id uuid not null,
  user_id uuid not null,
  code_hash text not null,
  code_expires_at timestamptz,
  primary key (shop_id, user_id),
  foreign key (shop_id, user_id)
    references public.shop_owners (shop_id, user_id)
    on delete cascade
);

alter table public.shop_claim_codes enable row level security;

-- posts ----------------------------------------------------------------------

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  photo_path text,
  text_original text,
  -- Keys are language codes. Any language can be added.
  text_translated jsonb not null default '{}'::jsonb,
  status text not null default 'live' check (status in ('live', 'kept', 'passed')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  -- Always created_at plus 2 hours. Clients cannot choose this value.
  -- A stored generated column cannot add an interval to timestamptz:
  -- that operator is only stable, not immutable. The trigger below sets it.
  expires_at timestamptz not null,
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  constraint posts_expires_at_matches_created_at
    check (expires_at = created_at + interval '2 hours')
);

alter table public.posts enable row level security;

create or replace function public.posts_set_expiry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := coalesce(new.created_at, now());
  new.expires_at := new.created_at + interval '2 hours';
  return new;
end;
$$;

drop trigger if exists posts_set_expiry on public.posts;
create trigger posts_set_expiry
  before insert on public.posts
  for each row
  execute function public.posts_set_expiry();

-- coupons --------------------------------------------------------------------

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  holder_id uuid not null references public.profiles (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete cascade,
  post_id uuid references public.posts (id) on delete set null,
  -- keep_post sets this from the shop time zone. The column has none of its own.
  day date not null,
  code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  status text not null default 'active' check (status in ('active', 'used', 'expired')),
  used_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint coupons_one_per_person_shop_day unique (holder_id, shop_id, day)
);

alter table public.coupons enable row level security;

-- indexes --------------------------------------------------------------------
-- Covers the policy filters: own profile id (primary key), shop_owners.user_id,
-- posts status + expires_at, posts.author_id, posts.shop_id, coupons.holder_id,
-- coupons.shop_id. is_verified_owner looks up shop_owners by its primary key.

create index if not exists posts_status_expires_at_idx
  on public.posts (status, expires_at);

create index if not exists posts_shop_id_created_at_idx
  on public.posts (shop_id, created_at desc);

create index if not exists posts_author_id_idx
  on public.posts (author_id);

create index if not exists shops_lat_lng_idx
  on public.shops (lat, lng);

create index if not exists coupons_holder_id_status_idx
  on public.coupons (holder_id, status);

create index if not exists coupons_shop_id_idx
  on public.coupons (shop_id);

create index if not exists shop_owners_user_id_idx
  on public.shop_owners (user_id);

-- helpers --------------------------------------------------------------------

create or replace function public.is_verified_owner(p_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.shop_owners
    where shop_id = p_shop_id
      and user_id = (select auth.uid())
      and status = 'verified'
  );
$$;

create or replace function public.keep_post(p_post_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
  v_author_id uuid;
  v_status text;
  v_expires_at timestamptz;
  v_tz text;
  v_day date;
  v_coupon_expires timestamptz;
  v_coupon_id uuid;
begin
  select posts.shop_id, posts.author_id, posts.status, posts.expires_at
    into v_shop_id, v_author_id, v_status, v_expires_at
  from public.posts as posts
  where posts.id = p_post_id
  for update;

  if not found then
    raise exception 'post not found';
  end if;

  if not public.is_verified_owner(v_shop_id) then
    raise exception 'not a verified owner';
  end if;

  if v_status <> 'live' or pg_catalog.now() < v_expires_at then
    raise exception 'post is not ready to keep';
  end if;

  update public.posts
  set status = 'kept',
      decided_at = pg_catalog.now(),
      decided_by = (select auth.uid())
  where id = p_post_id;

  select shops.timezone
    into v_tz
  from public.shops as shops
  where shops.id = v_shop_id;

  v_day := (pg_catalog.now() at time zone v_tz)::date;
  v_coupon_expires := ((v_day + 1)::timestamp at time zone v_tz);
  v_coupon_id := null;
  begin
    insert into public.coupons (holder_id, shop_id, post_id, day, expires_at)
    values (v_author_id, v_shop_id, p_post_id, v_day, v_coupon_expires)
    on conflict (holder_id, shop_id, day) do nothing
    returning id into strict v_coupon_id;
  exception
    when no_data_found then
      v_coupon_id := null;
  end;

  return v_coupon_id;
end;
$$;

create or replace function public.pass_post(p_post_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
  v_status text;
  v_expires_at timestamptz;
  v_photo_path text;
begin
  select posts.shop_id, posts.status, posts.expires_at, posts.photo_path
    into v_shop_id, v_status, v_expires_at, v_photo_path
  from public.posts as posts
  where posts.id = p_post_id
  for update;

  if not found then
    raise exception 'post not found';
  end if;

  if not public.is_verified_owner(v_shop_id) then
    raise exception 'not a verified owner';
  end if;

  if v_status <> 'live' or pg_catalog.now() < v_expires_at then
    raise exception 'post is not ready to pass';
  end if;

  update public.posts
  set status = 'passed',
      decided_at = pg_catalog.now(),
      decided_by = (select auth.uid()),
      photo_path = null
  where id = p_post_id;

  return v_photo_path;
end;
$$;

-- Plain haversine, earth radius 6371000 m. No extensions.
-- The lat/lng range is a bounding box so the planner can use shops_lat_lng_idx.
-- The circle test then drops corners of that box. A 1 km box does not wrap the
-- antimeridian except within 1 km of longitude 180.

create or replace function public.nearby_shops(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 1000
)
returns table (
  id uuid,
  slug text,
  name text,
  name_local text,
  category text,
  lat double precision,
  lng double precision,
  distance_m double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  with boxed as (
    select
      shops.id as shop_id,
      shops.slug as shop_slug,
      shops.name as shop_name,
      shops.name_local as shop_name_local,
      shops.category as shop_category,
      shops.lat as shop_lat,
      shops.lng as shop_lng,
      (
        6371000 * 2 * asin(
          sqrt(
            power(sin(radians(shops.lat - p_lat) / 2), 2)
            + cos(radians(p_lat)) * cos(radians(shops.lat))
              * power(sin(radians(shops.lng - p_lng) / 2), 2)
          )
        )
      ) as metres
    from public.shops as shops
    where shops.lat between
          p_lat - ((p_radius_m::double precision / 6371000.0) * (180.0 / pi()))
      and p_lat + ((p_radius_m::double precision / 6371000.0) * (180.0 / pi()))
      and shops.lng between
          p_lng - (
            (p_radius_m::double precision / 6371000.0) * (180.0 / pi())
            / greatest(cos(radians(p_lat)), 0.000001)
          )
      and p_lng + (
            (p_radius_m::double precision / 6371000.0) * (180.0 / pi())
            / greatest(cos(radians(p_lat)), 0.000001)
          )
  )
  select
    boxed.shop_id,
    boxed.shop_slug,
    boxed.shop_name,
    boxed.shop_name_local,
    boxed.shop_category,
    boxed.shop_lat,
    boxed.shop_lng,
    boxed.metres
  from boxed
  where boxed.metres <= p_radius_m
  order by boxed.metres;
$$;

revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;
revoke all on function public.posts_set_expiry() from public, anon, authenticated;
revoke all on function public.is_verified_owner(uuid) from public, anon, authenticated;
revoke all on function public.keep_post(uuid) from public, anon, authenticated;
revoke all on function public.pass_post(uuid) from public, anon, authenticated;
revoke all on function public.nearby_shops(double precision, double precision, integer) from public, anon, authenticated;

grant execute on function public.posts_set_expiry() to authenticated;
grant execute on function public.is_verified_owner(uuid) to authenticated;
grant execute on function public.keep_post(uuid) to authenticated;
grant execute on function public.pass_post(uuid) to authenticated;
grant execute on function public.nearby_shops(double precision, double precision, integer) to anon, authenticated;

-- Signup inserts into auth.users as the auth admin, which must run the trigger.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.create_profile_for_new_user() to supabase_auth_admin;
  end if;
end
$$;

-- policies -------------------------------------------------------------------
-- One policy per command. auth.uid() is wrapped in a select so it is read once.

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists shops_select_anon on public.shops;
create policy shops_select_anon
  on public.shops
  for select
  to anon
  using (true);

drop policy if exists shops_select_authenticated on public.shops;
create policy shops_select_authenticated
  on public.shops
  for select
  to authenticated
  using (true);

drop policy if exists shop_owners_select_own on public.shop_owners;
create policy shop_owners_select_own
  on public.shop_owners
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists shop_owners_insert_pending on public.shop_owners;
create policy shop_owners_insert_pending
  on public.shop_owners
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
  );

drop policy if exists posts_select_anon on public.posts;
create policy posts_select_anon
  on public.posts
  for select
  to anon
  using (
    (status = 'live' and expires_at > now())
    or status = 'kept'
  );

drop policy if exists posts_select_authenticated on public.posts;
create policy posts_select_authenticated
  on public.posts
  for select
  to authenticated
  using (
    (status = 'live' and expires_at > now())
    or status = 'kept'
    or author_id = (select auth.uid())
    or public.is_verified_owner(shop_id)
  );

drop policy if exists posts_insert_own_live on public.posts;
create policy posts_insert_own_live
  on public.posts
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and status = 'live'
  );

drop policy if exists coupons_select_holder_or_owner on public.coupons;
create policy coupons_select_holder_or_owner
  on public.coupons
  for select
  to authenticated
  using (
    holder_id = (select auth.uid())
    or public.is_verified_owner(shop_id)
  );

-- shop_claim_codes: row level security and no policies. Browser roles see nothing.

-- grants ---------------------------------------------------------------------
-- Hosted projects may grant every command to browser roles. Trim that back
-- to the commands the policies allow. shop_claim_codes stays with no browser grant.

revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.shops from public, anon, authenticated;
revoke all on table public.shop_owners from public, anon, authenticated;
revoke all on table public.shop_claim_codes from public, anon, authenticated;
revoke all on table public.posts from public, anon, authenticated;
revoke all on table public.coupons from public, anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name, avatar_url, locale) on table public.profiles to authenticated;
grant select on table public.shops to anon, authenticated;
grant select, insert on table public.shop_owners to authenticated;
grant select on table public.posts to anon, authenticated;
grant insert on table public.posts to authenticated;
grant select on table public.coupons to authenticated;

-- realtime -------------------------------------------------------------------
-- Add posts and coupons only when the publication exists and does not already
-- list them. A second apply is a no-op.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'posts'
    ) then
      alter publication supabase_realtime add table public.posts;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'coupons'
    ) then
      alter publication supabase_realtime add table public.coupons;
    end if;
  end if;
end
$$;
