-- Extra book pages. This file is not applied by the app or by tests.
-- Apply it only after the captain writes apply.

alter table public.shop_book_pages drop constraint if exists shop_book_pages_kind_check;

alter table public.shop_book_pages
  add constraint shop_book_pages_kind_check
  check (kind in ('storefront', 'logo', 'hours', 'menu', 'qr', 'other', 'extra'));
