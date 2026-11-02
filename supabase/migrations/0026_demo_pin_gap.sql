-- Demo pin gap. This file is not applied by the app or by tests.
-- Apply it only after the captain writes apply.
--
-- 0024 left Farm to Go (mala-mafia) and the coconut shake stand close enough
-- that their 44px pins overlap once the demo map fits all eight shops.
-- This moves only those two is_demo rows further apart. Other shops stay put.
-- A shop that is not is_demo is left where it is, even if the slug matches.
-- Running it again writes the same points.
-- reset_demo does not assign lat or lng, so a reset leaves these points in place.
-- Apply it after 0024_demo_shop_coords.sql.
-- Rollback: supabase/rollbacks/0026_demo_pin_gap.sql

update public.shops as shops
set lat = seed.lat,
    lng = seed.lng
from (
  values
    ('mala-mafia'::text, 12.56950::double precision, 99.95895::double precision),
    ('coconut-shake-stand'::text, 12.56680::double precision, 99.96050::double precision)
) as seed(slug, lat, lng)
where shops.slug = seed.slug
  and shops.is_demo = true
  and (shops.lat is distinct from seed.lat or shops.lng is distinct from seed.lng);
