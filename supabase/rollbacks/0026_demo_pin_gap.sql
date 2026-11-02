-- Rollback for 0026_demo_pin_gap.sql. Not applied by the app or by tests.
-- Restores the 0024 points for these two is_demo rows.

update public.shops as shops
set lat = seed.lat,
    lng = seed.lng
from (
  values
    ('mala-mafia'::text, 12.56898::double precision, 99.95895::double precision),
    ('coconut-shake-stand'::text, 12.56745::double precision, 99.96000::double precision)
) as seed(slug, lat, lng)
where shops.slug = seed.slug
  and shops.is_demo = true
  and (shops.lat is distinct from seed.lat or shops.lng is distinct from seed.lng);
