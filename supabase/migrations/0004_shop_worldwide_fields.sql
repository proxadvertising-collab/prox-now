-- Worldwide shop fields. This file is not applied by the app or by tests.
-- Apply it only after the captain writes apply.
--
-- New shops must not inherit a Thailand country, timezone, or currency.
-- Missing values stay null. place_seed_stats returns counts only.

alter table public.shops alter column country_code drop default;
alter table public.shops alter column country_code drop not null;

alter table public.shops alter column timezone drop default;
alter table public.shops alter column timezone drop not null;

alter table public.shops alter column currency drop default;
alter table public.shops alter column currency drop not null;

drop function if exists public.create_shop_from_snap(text, text, text, double precision, double precision, text);

create or replace function public.create_shop_from_snap(
  p_name text,
  p_name_local text,
  p_category text,
  p_lat double precision,
  p_lng double precision,
  p_address_hint text default null,
  p_country_code text default null,
  p_timezone text default null,
  p_currency text default null
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
  v_country text;
  v_timezone text;
  v_currency text;
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

  v_country := upper(btrim(coalesce(p_country_code, '')));
  if v_country = '' then
    v_country := null;
  elsif v_country !~ '^[A-Z]{2}$' or v_country in ('XX', 'T1') then
    raise exception 'bad_country';
  end if;

  v_timezone := nullif(btrim(coalesce(p_timezone, '')), '');
  if v_timezone is not null and v_timezone !~ '^[A-Za-z0-9_+-/]{1,64}$' then
    raise exception 'bad_timezone';
  end if;

  v_currency := upper(btrim(coalesce(p_currency, '')));
  if v_currency = '' then
    v_currency := null;
  elsif v_currency !~ '^[A-Z]{3}$' then
    raise exception 'bad_currency';
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
        country_code, timezone, currency,
        claimed, is_demo, source, created_by
      )
      values (
        v_slug, v_name, v_local, v_category, p_lat, p_lng, v_hint,
        v_country, v_timezone, v_currency,
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

revoke all on function public.create_shop_from_snap(text, text, text, double precision, double precision, text, text, text, text) from public, anon;
grant execute on function public.create_shop_from_snap(text, text, text, double precision, double precision, text, text, text, text) to authenticated;

create or replace function public.place_seed_stats()
returns table (
  places_added bigint,
  countries bigint,
  moments_seeded bigint,
  live_now bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.shops where created_by is not null),
    (select count(distinct country_code) from public.shops where created_by is not null and country_code is not null),
    (select count(*) from public.posts),
    (select count(*) from public.posts where status = 'live' and expires_at > now());
$$;

revoke all on function public.place_seed_stats() from public;
grant execute on function public.place_seed_stats() to anon, authenticated;
