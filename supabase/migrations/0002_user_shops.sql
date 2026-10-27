-- User-created shops. This file is not applied by the app or by tests.
-- Apply it only after the captain writes apply.
--
-- shops already has row level security and public select policies.
-- This migration does not add an insert policy. Clients create a shop
-- only through create_shop_from_snap.

alter table public.shops
  add column if not exists created_by uuid references public.profiles (id) on delete set null;

alter table public.shops
  add column if not exists source text not null default 'seed';

alter table public.shops
  drop constraint if exists shops_source_check;

alter table public.shops
  add constraint shops_source_check check (source in ('seed', 'user'));

create or replace function public.create_shop_from_snap(
  p_name text,
  p_name_local text,
  p_category text,
  p_lat double precision,
  p_lng double precision,
  p_address_hint text default null
)
returns public.shops
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_local text;
  v_category text;
  v_hint text;
  v_base text;
  v_slug text;
  v_shop public.shops;
  v_try integer;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  v_local := nullif(btrim(coalesce(p_name_local, '')), '');
  v_hint := nullif(btrim(coalesce(p_address_hint, '')), '');
  v_category := lower(btrim(coalesce(p_category, '')));

  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'bad_name';
  end if;

  if v_local is not null and char_length(v_local) > 80 then
    raise exception 'bad_name';
  end if;

  if v_category not in (
    'street_food', 'drinks', 'restaurant', 'fruit',
    'laundry', 'home_services', 'barber', 'other'
  ) then
    v_category := 'other';
  end if;

  if p_lat is null or p_lng is null
     or p_lat < -90 or p_lat > 90
     or p_lng < -180 or p_lng > 180 then
    raise exception 'bad_location';
  end if;

  if (
    select count(*)
    from public.shops
    where created_by = auth.uid()
      and created_at > now() - interval '24 hours'
  ) >= 20 then
    raise exception 'rate_limited';
  end if;

  select shops.*
    into v_shop
  from public.shops as shops
  where (
    6371000 * 2 * asin(
      sqrt(
        power(sin(radians(shops.lat - p_lat) / 2), 2)
        + cos(radians(p_lat)) * cos(radians(shops.lat))
          * power(sin(radians(shops.lng - p_lng) / 2), 2)
      )
    )
  ) <= 40
    and (
      lower(shops.name) = lower(v_name)
      or (
        v_local is not null
        and shops.name_local is not null
        and lower(shops.name_local) = lower(v_local)
      )
    )
  limit 1;

  if found then
    return v_shop;
  end if;

  v_base := lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_base := btrim(v_base, '-');
  if v_base is null or v_base = '' then
    v_base := 'shop';
  end if;
  v_base := left(v_base, 40);

  v_try := 0;
  loop
    v_try := v_try + 1;
    v_slug := v_base || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
    begin
      insert into public.shops (
        slug, name, name_local, category, lat, lng, address_hint,
        claimed, is_demo, source, created_by
      )
      values (
        v_slug, v_name, v_local, v_category, p_lat, p_lng, v_hint,
        false, false, 'user', auth.uid()
      )
      returning * into v_shop;
      return v_shop;
    exception
      when unique_violation then
        if v_try >= 5 then
          raise;
        end if;
    end;
  end loop;
end;
$$;

revoke all on function public.create_shop_from_snap(text, text, text, double precision, double precision, text) from public, anon;
grant execute on function public.create_shop_from_snap(text, text, text, double precision, double precision, text) to authenticated;
