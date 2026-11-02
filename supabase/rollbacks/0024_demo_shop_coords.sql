-- Rollback for 0024_demo_shop_coords.sql. Not applied by the app or by tests.
-- Puts the eight is_demo launch shops back on the old clustered points.
-- A shop that is not is_demo is left alone. Running it again writes the same points.

update public.shops as shops
set lat = seed.lat,
    lng = seed.lng
from (
  values
    ('mala-mafia'::text, 12.56850::double precision, 99.95750::double precision),
    ('coconut-shake-stand'::text, 12.56835::double precision, 99.95790::double precision),
    ('krua-mae-yen'::text, 12.56870::double precision, 99.95810::double precision),
    ('pak-kapi'::text, 12.56820::double precision, 99.95730::double precision),
    ('thuk-jai-chieo'::text, 12.56860::double precision, 99.95840::double precision),
    ('clean-together'::text, 12.56805::double precision, 99.95770::double precision),
    ('baan-air'::text, 12.56885::double precision, 99.95720::double precision),
    ('beegee-barber'::text, 12.56845::double precision, 99.95700::double precision)
) as seed(slug, lat, lng)
where shops.slug = seed.slug
  and shops.is_demo = true
  and (shops.lat is distinct from seed.lat or shops.lng is distinct from seed.lng);
