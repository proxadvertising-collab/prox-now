-- Post photos. This file is not applied by the app or by tests.
-- Apply it only after the captain writes apply.
--
-- The original photo is never stored. The server uploads one blurred JPEG.
-- storage.objects already has row level security. There is no update or delete
-- policy here. A later server function removes objects.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-photos', 'post-photos', true, 614400, array['image/jpeg'])
on conflict (id) do nothing;

drop policy if exists post_photos_select_anon on storage.objects;
create policy post_photos_select_anon
  on storage.objects
  for select
  to anon
  using (bucket_id = 'post-photos');

drop policy if exists post_photos_select_authenticated on storage.objects;
create policy post_photos_select_authenticated
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'post-photos');

drop policy if exists post_photos_insert_own on storage.objects;
create policy post_photos_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'post-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create index if not exists posts_shop_status_expires_idx
  on public.posts (shop_id, status, expires_at);

create index if not exists posts_author_created_at_idx
  on public.posts (author_id, created_at desc);

create or replace function public.create_post(
  p_shop_id uuid,
  p_photo_path text,
  p_text_original text,
  p_text_translated jsonb
)
returns public.posts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_text text;
  v_keys integer;
  v_post public.posts;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;

  if not exists (select 1 from public.shops where id = p_shop_id) then
    raise exception 'shop_not_found';
  end if;

  if p_photo_path is null
     or position(v_uid::text || '/' in p_photo_path) <> 1
     or p_photo_path like '%..%' then
    raise exception 'bad_photo_path';
  end if;

  v_text := btrim(coalesce(p_text_original, ''));
  if char_length(v_text) > 400 then
    raise exception 'bad_text';
  end if;

  if p_text_translated is null or jsonb_typeof(p_text_translated) <> 'object' then
    raise exception 'bad_text';
  end if;

  select count(*) into v_keys from jsonb_object_keys(p_text_translated);
  if v_keys > 6 then
    raise exception 'bad_text';
  end if;

  if (
    select count(*)
    from public.posts
    where author_id = v_uid
      and created_at > now() - interval '24 hours'
  ) >= 10 then
    raise exception 'rate_limited';
  end if;

  if exists (
    select 1
    from public.posts
    where author_id = v_uid
      and shop_id = p_shop_id
      and status = 'live'
      and expires_at > now()
  ) then
    raise exception 'already_live';
  end if;

  -- posts_set_expiry stamps created_at and expires_at. Do not set them here.
  insert into public.posts (
    shop_id, author_id, photo_path, text_original, text_translated, status, is_demo
  )
  values (
    p_shop_id, v_uid, p_photo_path, nullif(v_text, ''), p_text_translated, 'live', false
  )
  returning * into v_post;

  return v_post;
end;
$$;

revoke all on function public.create_post(uuid, text, text, jsonb) from public, anon;
grant execute on function public.create_post(uuid, text, text, jsonb) to authenticated;
