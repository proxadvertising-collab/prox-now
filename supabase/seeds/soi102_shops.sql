-- NOT APPLIED. Run only when the captain writes apply. Demo data for the launch market.
-- Street-side points around 12.5684 N, 99.9577 E, about 150 to 900 m out.
-- Shops that already exist keep their row until 0024_demo_shop_coords.sql.
-- 0025_thuk_jai_street.sql moves thuk-jai-chieo off the San Paolo Hospital footprint.

insert into public.shops (
  slug,
  name,
  name_local,
  category,
  lat,
  lng,
  country_code,
  timezone,
  currency,
  is_demo
) values
  ('mala-mafia', 'Mala Mafia', null, 'street_food', 12.56950, 99.95895, 'TH', 'Asia/Bangkok', 'THB', true),
  ('coconut-shake-stand', 'Coconut shake stand', 'มะพร้าวปั่นนมสด', 'drinks', 12.56680, 99.96050, 'TH', 'Asia/Bangkok', 'THB', true),
  ('krua-mae-yen', 'Krua Mae Yen', null, 'restaurant', 12.57063, 99.95438, 'TH', 'Asia/Bangkok', 'THB', true),
  ('pak-kapi', 'Pak Kapi', 'ปากกะปิ', 'fruit', 12.56641, 99.95715, 'TH', 'Asia/Bangkok', 'THB', true),
  ('thuk-jai-chieo', 'Thuk Jai Chieo', null, 'restaurant', 12.56510, 99.96140, 'TH', 'Asia/Bangkok', 'THB', true),
  ('clean-together', 'Clean Together', 'คลีนทูเกเตอร์', 'laundry', 12.57455, 99.95861, 'TH', 'Asia/Bangkok', 'THB', true),
  ('baan-air', 'Baan Air', 'บ้านแอร์', 'home_services', 12.57042, 99.95092, 'TH', 'Asia/Bangkok', 'THB', true),
  ('beegee-barber', 'BEEGEE Barber', null, 'barber', 12.56079, 99.95491, 'TH', 'Asia/Bangkok', 'THB', true)
on conflict (slug) do nothing;
