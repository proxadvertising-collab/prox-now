-- Posts are server-only. This file is not applied by the app or by tests.
-- Apply it only after the captain writes apply.
--
-- Clients cannot insert or update posts. Expiry and ready_at are stamped
-- by the trigger. Only the service role may move ready_at earlier.
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
  new.expires_at := old.expires_at;
  if auth.role() is distinct from 'service_role' or new.ready_at is null or new.ready_at > old.expires_at then
    new.ready_at := old.ready_at;
  end if;
  return new;
end;
$$;

drop trigger if exists posts_set_expiry on public.posts;
create trigger posts_set_expiry
  before insert or update on public.posts
  for each row
  execute function public.posts_set_expiry();

revoke all on function public.create_post(uuid, text, text, jsonb, jsonb) from public, anon, authenticated;
drop function if exists public.create_post(uuid, text, text, jsonb, jsonb);

create or replace function public.create_post(
  p_shop_id uuid,
  p_photo_path text,
  p_text_original text,
  p_text_translated jsonb,
  p_facts jsonb default null,
  p_author_id uuid default null
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
    raise exception 'server_only';
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
