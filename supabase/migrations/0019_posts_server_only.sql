-- Posts are server-only. This file is not applied by the app or by tests.
-- Apply it only after the captain writes apply.
--
-- Clients cannot insert or update posts. Expiry and ready_at are stamped
-- by the trigger on insert only. A temporary 5-argument create_post wrapper
-- keeps the live signature, including p_facts default null. Do not drop the
-- wrapper in this file. Drop it in a later migration.
-- Rollback: recreate posts_insert_own_live and grant insert on public.posts
-- to authenticated, as in 0001_core_schema.sql. Grant execute on
-- create_post(uuid, text, text, jsonb, jsonb) to authenticated.
-- Drop column public.posts.ready_at if it should go away.

drop policy if exists posts_insert_own_live on public.posts;
drop policy if exists posts_update_own on public.posts;
drop policy if exists posts_update_authenticated on public.posts;

revoke insert, update, delete on table public.posts from public, anon, authenticated;

alter table public.posts add column if not exists ready_at timestamptz;

update public.posts set ready_at = expires_at where ready_at is null;

alter table public.posts alter column ready_at set default pg_catalog.now();

create or replace function public.posts_set_expiry()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := pg_catalog.now();
    if coalesce(new.is_seed, false) then
      new.expires_at := timestamptz '2026-11-12 00:00+00';
    else
      new.is_seed := false;
      new.expires_at := new.created_at + interval '2 hours';
    end if;
    new.ready_at := new.expires_at;
    return new;
  end if;

  new.created_at := old.created_at;
  new.is_seed := old.is_seed;
  return new;
end;
$$;

drop trigger if exists posts_set_expiry on public.posts;
create trigger posts_set_expiry
  before insert or update on public.posts
  for each row
  execute function public.posts_set_expiry();

create or replace function public.create_post(
  p_shop_id uuid,
  p_photo_path text,
  p_text_original text,
  p_text_translated jsonb,
  p_facts jsonb,
  p_author_id uuid
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
  if auth.role() is distinct from 'service_role' then
    if auth.uid() is null or p_author_id is distinct from auth.uid() then
      raise exception 'server_only';
    end if;
  end if;

  v_uid := p_author_id;
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
      and coalesce(is_seed, false) = false
      and created_at > now() - interval '24 hours'
  ) >= 40 then
    raise exception 'rate_limited';
  end if;

  if (
    select count(*)
    from public.posts
    where author_id = v_uid
      and shop_id = p_shop_id
      and status = 'live'
      and expires_at > now()
      and coalesce(is_seed, false) = false
  ) >= 10 then
    raise exception 'shop_full';
  end if;

  insert into public.posts (
    shop_id, author_id, photo_path, text_original, text_translated, facts, status, is_demo
  )
  values (
    p_shop_id, v_uid, p_photo_path, nullif(v_text, ''), p_text_translated, p_facts, 'live', false
  )
  returning * into v_post;

  if p_facts is not null then
    insert into public.place_facts (shop_id, facts, post_id)
    values (p_shop_id, public.anonymous_place_facts(p_facts), v_post.id);
  end if;

  return v_post;
end;
$$;

revoke all on function public.create_post(uuid, text, text, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.create_post(uuid, text, text, jsonb, jsonb, uuid) to service_role;

-- Temporary wrapper. Same signature as prod, including p_facts default null,
-- so create-or-replace does not try to drop that default. A 5-argument call
-- resolves only to this function because the 6-argument one has no defaults.
-- Do not drop the wrapper in this file. Drop it in a later migration.
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
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  return public.create_post(
    p_shop_id,
    p_photo_path,
    p_text_original,
    p_text_translated,
    p_facts,
    auth.uid()
  );
end;
$$;

revoke all on function public.create_post(uuid, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.create_post(uuid, text, text, jsonb, jsonb) to authenticated;

create or replace function public.keep_post(
  p_post_id uuid,
  p_offer text default null,
  p_days integer default 7
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id uuid;
  v_author_id uuid;
  v_status text;
  v_expires_at timestamptz;
  v_ready_at timestamptz;
  v_tz text;
  v_day date;
  v_days integer;
  v_coupon_expires timestamptz;
  v_coupon_id uuid;
  v_repeat boolean;
  v_offer text;
begin
  select posts.shop_id, posts.author_id, posts.status, posts.expires_at, posts.ready_at
    into v_shop_id, v_author_id, v_status, v_expires_at, v_ready_at
  from public.posts as posts
  where posts.id = p_post_id
  for update;

  if not found then
    raise exception 'post not found';
  end if;

  if not public.is_verified_owner(v_shop_id) then
    raise exception 'not a verified owner';
  end if;

  if v_status <> 'live' or now() < coalesce(v_ready_at, v_expires_at) then
    raise exception 'post is not ready to keep';
  end if;

  update public.posts
  set status = 'kept',
      decided_at = now(),
      decided_by = auth.uid()
  where id = p_post_id;

  select coalesce(nullif(btrim(shops.timezone), ''), 'UTC')
    into v_tz
  from public.shops as shops
  where shops.id = v_shop_id;

  begin
    v_day := (now() at time zone v_tz)::date;
  exception
    when others then
      v_tz := 'UTC';
      v_day := (now() at time zone 'UTC')::date;
  end;

  v_days := case when p_days in (1, 7, 30) then p_days else 7 end;
  v_coupon_expires := now() + make_interval(days => v_days);
  v_offer := nullif(left(btrim(coalesce(p_offer, '')), 120), '');

  select exists (
    select 1
    from public.shops as shops
    join public.demo_accounts as demo_accounts
      on demo_accounts.user_id = v_author_id
     and demo_accounts.role = 'explorer'
    where shops.id = v_shop_id
      and shops.is_demo
  ) into v_repeat;

  v_coupon_id := null;
  begin
    insert into public.coupons (holder_id, shop_id, post_id, day, expires_at, demo_repeat, offer)
    values (v_author_id, v_shop_id, p_post_id, v_day, v_coupon_expires, v_repeat, v_offer)
    on conflict (holder_id, shop_id, day) where demo_repeat = false do nothing
    returning id into strict v_coupon_id;
  exception
    when no_data_found then
      v_coupon_id := null;
  end;

  return v_coupon_id;
end;
$$;

revoke all on function public.keep_post(uuid, text, integer) from public, anon;
grant execute on function public.keep_post(uuid, text, integer) to authenticated;

create or replace function public.demo_end_window(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id uuid;
  v_seed boolean;
  v_demo boolean;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;

  select posts.shop_id, posts.is_seed, posts.status, shops.is_demo
    into v_shop_id, v_seed, v_status, v_demo
  from public.posts as posts
  join public.shops as shops on shops.id = posts.shop_id
  where posts.id = p_post_id
  for update of posts;

  if not found then
    raise exception 'not_found';
  end if;
  if not public.is_verified_owner(v_shop_id) then
    raise exception 'not_owner';
  end if;
  if v_demo is not true then
    raise exception 'not_demo_shop';
  end if;
  if v_seed then
    raise exception 'seed_post';
  end if;
  if v_status <> 'live' then
    raise exception 'not_live';
  end if;

  update public.posts
  set expires_at = now(),
      ready_at = now()
  where id = p_post_id;
end;
$$;

create or replace function public.pass_post_begin(p_post_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id uuid;
  v_status text;
  v_expires_at timestamptz;
  v_ready_at timestamptz;
  v_photo_path text;
begin
  select posts.shop_id, posts.status, posts.expires_at, posts.ready_at, posts.photo_path
    into v_shop_id, v_status, v_expires_at, v_ready_at, v_photo_path
  from public.posts as posts
  where posts.id = p_post_id
  for update;

  if not found then
    raise exception 'post not found';
  end if;

  if not public.is_verified_owner(v_shop_id) then
    raise exception 'not a verified owner';
  end if;

  if v_status <> 'live' or now() < coalesce(v_ready_at, v_expires_at) then
    raise exception 'post is not ready to pass';
  end if;

  return v_photo_path;
end;
$$;

create or replace function public.pass_post_finish(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id uuid;
  v_status text;
  v_expires_at timestamptz;
  v_ready_at timestamptz;
  v_photo_path text;
begin
  select posts.shop_id, posts.status, posts.expires_at, posts.ready_at, posts.photo_path
    into v_shop_id, v_status, v_expires_at, v_ready_at, v_photo_path
  from public.posts as posts
  where posts.id = p_post_id
  for update;

  if not found then
    raise exception 'post not found';
  end if;

  if not public.is_verified_owner(v_shop_id) then
    raise exception 'not a verified owner';
  end if;

  if v_status <> 'live' or now() < coalesce(v_ready_at, v_expires_at) then
    raise exception 'post is not ready to pass';
  end if;

  if v_photo_path is not null and exists (
    select 1
    from storage.objects
    where bucket_id = 'post-photos'
      and name = v_photo_path
  ) then
    raise exception 'photo_still_stored';
  end if;

  update public.posts
  set status = 'passed',
      decided_at = now(),
      decided_by = auth.uid(),
      photo_path = null,
      text_original = null,
      text_translated = '{}'::jsonb,
      facts = null
  where id = p_post_id;

  update public.place_facts
  set post_id = null
  where post_id = p_post_id;
end;
$$;

create or replace function public.owner_inbox()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;

  return jsonb_build_object(
    'cards', coalesce((
      select jsonb_agg(to_jsonb(card))
      from (
        select
          p.id,
          p.shop_id as "shopId",
          s.name as "shopName",
          s.slug as "shopSlug",
          p.photo_path as "photoPath",
          p.facts,
          split_part(coalesce(pr.display_name, ''), ' ', 1) as "authorName",
          coalesce(p.ready_at, p.expires_at) as "expiresAt"
        from public.posts as p
        join public.shops as s on s.id = p.shop_id
        left join public.profiles as pr on pr.id = p.author_id
        where public.is_verified_owner(p.shop_id)
          and p.is_seed = false
          and p.status = 'live'
          and coalesce(p.ready_at, p.expires_at) <= now()
          and coalesce(p.ready_at, p.expires_at) + interval '7 days' > now()
        order by p.created_at desc
      ) as card
    ), '[]'::jsonb),
    'liveNow', coalesce((
      select jsonb_agg(to_jsonb(card))
      from (
        select
          p.id,
          p.shop_id as "shopId",
          s.name as "shopName",
          s.slug as "shopSlug",
          p.photo_path as "photoPath",
          p.facts,
          split_part(coalesce(pr.display_name, ''), ' ', 1) as "authorName",
          coalesce(p.ready_at, p.expires_at) as "expiresAt"
        from public.posts as p
        join public.shops as s on s.id = p.shop_id
        left join public.profiles as pr on pr.id = p.author_id
        where public.is_verified_owner(p.shop_id)
          and s.is_demo
          and p.is_seed = false
          and p.status = 'live'
          and coalesce(p.ready_at, p.expires_at) > now()
        order by p.created_at desc
      ) as card
    ), '[]'::jsonb),
    'keptToday', (
      select count(*)
      from public.posts as p
      where public.is_verified_owner(p.shop_id)
        and p.is_seed = false
        and p.status = 'kept'
        and p.decided_at > now() - interval '24 hours'
    ),
    'passedToday', (
      select count(*)
      from public.posts as p
      where public.is_verified_owner(p.shop_id)
        and p.is_seed = false
        and p.status = 'passed'
        and p.decided_at > now() - interval '24 hours'
    )
  );
end;
$$;
