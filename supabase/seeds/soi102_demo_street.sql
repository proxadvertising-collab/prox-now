-- NOT APPLIED. Run only when the captain writes apply.
-- psql "$DATABASE_URL" -f supabase/seeds/soi102_demo_street.sql
-- Load supabase/seeds/soi102_shops.sql first.
-- Posts and coupons need one public.demo_accounts row that also has a profile.
-- The Mala Mafia book does not. Every write is limited to shops.is_demo = true.
-- The posts trigger stamps created_at to now() and expires_at to created_at + 2 hours.

delete from public.coupons as coupons
using public.shops as shops
where coupons.shop_id = shops.id
  and shops.is_demo = true
  and coupons.holder_id in (
    select demo_accounts.user_id from public.demo_accounts as demo_accounts
  );

delete from public.posts as posts
using public.shops as shops
where posts.shop_id = shops.id
  and shops.is_demo = true
  and posts.is_demo = true;

delete from public.shop_book_pages as pages
using public.shops as shops
where pages.shop_id = shops.id
  and shops.is_demo = true
  and shops.slug = 'mala-mafia';

delete from public.shop_books as books
using public.shops as shops
where books.shop_id = shops.id
  and shops.is_demo = true
  and shops.slug = 'mala-mafia';

insert into public.posts (
  id,
  shop_id,
  author_id,
  photo_path,
  text_original,
  text_translated,
  status,
  is_demo,
  is_seed,
  expires_at
)
select
  deal.id,
  shops.id,
  demo_author.user_id,
  null,
  deal.text_original,
  '{}'::jsonb,
  'live',
  true,
  false,
  now() + interval '2 hours'
from (
  values
    ('11111111-1111-4111-8111-111111111101'::uuid, 'mala-mafia', 'Second skewer free after 9'),
    ('11111111-1111-4111-8111-111111111102'::uuid, 'coconut-shake-stand', 'Mango shake 25 baht until sunset'),
    ('11111111-1111-4111-8111-111111111103'::uuid, 'krua-mae-yen', 'Omelette rice set 60 baht at lunch'),
    ('11111111-1111-4111-8111-111111111104'::uuid, 'pak-kapi', 'Three ripe mangoes for 50'),
    ('11111111-1111-4111-8111-111111111105'::uuid, 'beegee-barber', 'Cut and beard 150 baht today')
) as deal(id, slug, text_original)
join public.shops as shops on shops.slug = deal.slug and shops.is_demo = true
cross join (
  select profiles.id as user_id
  from public.demo_accounts as demo_accounts
  join public.profiles as profiles on profiles.id = demo_accounts.user_id
  order by case demo_accounts.role when 'explorer' then 0 else 1 end
  limit 1
) as demo_author
on conflict (id) do nothing;

insert into public.coupons (
  id,
  holder_id,
  shop_id,
  post_id,
  day,
  code,
  status,
  expires_at,
  demo_repeat
)
select
  coupon.id,
  demo_author.user_id,
  shops.id,
  posts.id,
  (timezone('Asia/Bangkok', now()))::date,
  coupon.code,
  'active',
  now() + interval '2 hours',
  true
from (
  values
    ('11111111-1111-4111-8111-111111111201'::uuid, 'mala-mafia', 'Second skewer free after 9', 'DEMOMALA01'),
    ('11111111-1111-4111-8111-111111111202'::uuid, 'coconut-shake-stand', 'Mango shake 25 baht until sunset', 'DEMOCOCO02'),
    ('11111111-1111-4111-8111-111111111203'::uuid, 'pak-kapi', 'Three ripe mangoes for 50', 'DEMOPAK003')
) as coupon(id, slug, deal, code)
join public.shops as shops on shops.slug = coupon.slug and shops.is_demo = true
join public.posts as posts
  on posts.shop_id = shops.id
 and posts.is_demo = true
 and posts.text_original = coupon.deal
cross join (
  select profiles.id as user_id
  from public.demo_accounts as demo_accounts
  join public.profiles as profiles on profiles.id = demo_accounts.user_id
  order by case demo_accounts.role when 'explorer' then 0 else 1 end
  limit 1
) as demo_author
on conflict do nothing;

insert into public.shop_books (
  shop_id,
  status,
  tagline,
  theme,
  hours,
  source_language
)
select
  shops.id,
  'live',
  'Smoothies, coffee, and brunch',
  '{"swatches":["#E23D28","#1C0E05","#F7F0E8","#FF8A3D","#2A1810"],"accent":"#E23D28","ink":"#1C0E05","mood":"bold","colors":["#E23D28","#1C0E05","#F7F0E8"]}'::jsonb,
  '{"raw":"Daily 16:00-23:00","days":[{"open":"16:00","close":"23:00"}]}'::jsonb,
  'en'
from public.shops as shops
where shops.slug = 'mala-mafia'
  and shops.is_demo = true
on conflict (shop_id) do nothing;
