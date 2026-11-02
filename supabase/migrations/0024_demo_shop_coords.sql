-- Demo shop pins. This file is not applied by the app or by tests.
-- Apply it only after the captain writes apply.
--
-- The eight launch shops were stacked within about 100 m of 12.5684 N, 99.9577 E.
-- This moves only those is_demo rows onto street-side points about 150 to 900 m out.
-- A shop that is not is_demo is left where it is, even if the slug matches.
-- Running it again writes the same points.
-- reset_demo does not assign lat or lng, so a reset leaves these points in place.
-- Rollback: supabase/rollbacks/0024_demo_shop_coords.sql

update public.shops as shops
set lat = seed.lat,
    lng = seed.lng
from (
  values
    ('mala-mafia'::text, 12.56898::double precision, 99.95895::double precision),
    ('coconut-shake-stand'::text, 12.56745::double precision, 99.96000::double precision),
    ('krua-mae-yen'::text, 12.57063::double precision, 99.95438::double precision),
    ('pak-kapi'::text, 12.56641::double precision, 99.95715::double precision),
    ('thuk-jai-chieo'::text, 12.56366::double precision, 99.95917::double precision),
    ('clean-together'::text, 12.57455::double precision, 99.95861::double precision),
    ('baan-air'::text, 12.57042::double precision, 99.95092::double precision),
    ('beegee-barber'::text, 12.56079::double precision, 99.95491::double precision)
) as seed(slug, lat, lng)
where shops.slug = seed.slug
  and shops.is_demo = true
  and (shops.lat is distinct from seed.lat or shops.lng is distinct from seed.lng);
