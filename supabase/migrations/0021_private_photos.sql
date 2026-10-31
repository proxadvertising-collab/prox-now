-- Private photo buckets. This file is not applied by the app or by tests.
-- Apply it only after the captain writes apply.
--
-- post-photos and shop-book are no longer public. The app serves them
-- with short-lived signed URLs.
-- Rollback: update storage.buckets set public = true where id in
-- ('post-photos', 'shop-book'); then recreate the select policies from
-- 0003_post_photos.sql and 0011_shop_book.sql.

update storage.buckets
set public = false
where id in ('post-photos', 'shop-book');

drop policy if exists post_photos_select_anon on storage.objects;
drop policy if exists post_photos_select_authenticated on storage.objects;
drop policy if exists shop_book_select_anon on storage.objects;
drop policy if exists shop_book_select_authenticated on storage.objects;
