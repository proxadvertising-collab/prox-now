-- NOT APPLIED. Run only when the captain writes apply. Demo data for the launch market.
-- Placeholder coordinates around 12.5684 N, 99.9577 E. Replace before a real demo.

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
  ('mala-mafia', 'Mala Mafia', null, 'street_food', 12.56850, 99.95750, 'TH', 'Asia/Bangkok', 'THB', true), -- TODO_REAL_COORDS
  ('coconut-shake-stand', 'Coconut shake stand', 'มะพร้าวปั่นนมสด', 'drinks', 12.56835, 99.95790, 'TH', 'Asia/Bangkok', 'THB', true), -- TODO_REAL_COORDS
  ('krua-mae-yen', 'Krua Mae Yen', null, 'restaurant', 12.56870, 99.95810, 'TH', 'Asia/Bangkok', 'THB', true), -- TODO_REAL_COORDS
  ('pak-kapi', 'Pak Kapi', 'ปากกะปิ', 'fruit', 12.56820, 99.95730, 'TH', 'Asia/Bangkok', 'THB', true), -- TODO_REAL_COORDS
  ('thuk-jai-chieo', 'Thuk Jai Chieo', null, 'restaurant', 12.56860, 99.95840, 'TH', 'Asia/Bangkok', 'THB', true), -- TODO_REAL_COORDS
  ('clean-together', 'Clean Together', 'คลีนทูเกเตอร์', 'laundry', 12.56805, 99.95770, 'TH', 'Asia/Bangkok', 'THB', true), -- TODO_REAL_COORDS
  ('baan-air', 'Baan Air', 'บ้านแอร์', 'home_services', 12.56885, 99.95720, 'TH', 'Asia/Bangkok', 'THB', true), -- TODO_REAL_COORDS
  ('beegee-barber', 'BEEGEE Barber', null, 'barber', 12.56845, 99.95700, 'TH', 'Asia/Bangkok', 'THB', true) -- TODO_REAL_COORDS
on conflict (slug) do nothing;
