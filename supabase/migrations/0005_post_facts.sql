-- Post facts. This file is not applied by the app or by tests.
-- Apply it only after the captain writes apply.
--
-- facts describe the place and the moment. They are optional.
-- delete_own_post lets the author remove their row. The route then
-- removes the blurred object with that same user session.

alter table public.posts
  add column if not exists facts jsonb default null;

alter table public.posts
  drop constraint if exists posts_facts_object_check;

alter table public.posts
  add constraint posts_facts_object_check
  check (facts is null or (jsonb_typeof(facts) = 'object' and pg_column_size(facts) <= 4096));

drop function if exists public.create_post(uuid, text, text, jsonb);

create or replace function public.create_post(
  p_shop_id uuid,
  p_photo_path text,
  p_text_original text,
  p_text_translated jsonb,
  p_facts jsonb default null
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

  if p_facts is not null and (jsonb_typeof(p_facts) <> 'object' or pg_column_size(p_facts) > 4096) then
    raise exception 'bad_facts';
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
    shop_id, author_id, photo_path, text_original, text_translated, facts, status, is_demo
  )
  values (
    p_shop_id, v_uid, p_photo_path, nullif(v_text, ''), p_text_translated, p_facts, 'live', false
  )
  returning * into v_post;

  return v_post;
end;
$$;

revoke all on function public.create_post(uuid, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.create_post(uuid, text, text, jsonb, jsonb) to authenticated;

create or replace function public.delete_own_post(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_author uuid;
  v_path text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;

  select author_id, photo_path into v_author, v_path
  from public.posts
  where id = p_id;

  if not found then
    raise exception 'not_found';
  end if;

  if v_author is distinct from v_uid then
    raise exception 'not_author';
  end if;

  delete from public.posts where id = p_id;
  return v_path;
end;
$$;

revoke all on function public.delete_own_post(uuid) from public, anon;
grant execute on function public.delete_own_post(uuid) to authenticated;

drop policy if exists post_photos_delete_own on storage.objects;

create policy post_photos_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'post-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
