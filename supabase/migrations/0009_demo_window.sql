-- Demo window. This file is not applied by the app or by tests.
-- Apply it only after the captain writes apply.
--
-- demo_end_window ends a live non-seed post on a demo shop so Keep/Pass opens now.
-- The demo explorer may receive more than one coupon per demo shop per local day.
-- Everyone else keeps one coupon per shop per day.

alter table public.coupons
  add column if not exists demo_repeat boolean not null default false;

alter table public.coupons drop constraint if exists coupons_one_per_person_shop_day;

create unique index if not exists coupons_once_per_real_day
  on public.coupons (holder_id, shop_id, day)
  where demo_repeat = false;

create or replace function public.keep_post(p_post_id uuid)
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
  v_tz text;
  v_day date;
  v_coupon_expires timestamptz;
  v_coupon_id uuid;
  v_repeat boolean;
begin
  select posts.shop_id, posts.author_id, posts.status, posts.expires_at
    into v_shop_id, v_author_id, v_status, v_expires_at
  from public.posts as posts
  where posts.id = p_post_id
  for update;

  if not found then
    raise exception 'post not found';
  end if;

  if not public.is_verified_owner(v_shop_id) then
    raise exception 'not a verified owner';
  end if;

  if v_status <> 'live' or now() < v_expires_at then
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
    v_coupon_expires := ((v_day + 1)::timestamp at time zone v_tz);
  exception
    when others then
      v_tz := 'UTC';
      v_day := (now() at time zone 'UTC')::date;
      v_coupon_expires := ((v_day + 1)::timestamp at time zone 'UTC');
  end;

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
    insert into public.coupons (holder_id, shop_id, post_id, day, expires_at, demo_repeat)
    values (v_author_id, v_shop_id, p_post_id, v_day, v_coupon_expires, v_repeat)
    on conflict (holder_id, shop_id, day) where demo_repeat = false do nothing
    returning id into strict v_coupon_id;
  exception
    when no_data_found then
      v_coupon_id := null;
  end;

  return v_coupon_id;
end;
$$;

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
  set expires_at = now()
  where id = p_post_id;
end;
$$;

revoke all on function public.demo_end_window(uuid) from public, anon;
grant execute on function public.demo_end_window(uuid) to authenticated;

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
          p.expires_at as "expiresAt"
        from public.posts as p
        join public.shops as s on s.id = p.shop_id
        left join public.profiles as pr on pr.id = p.author_id
        where public.is_verified_owner(p.shop_id)
          and p.is_seed = false
          and p.status = 'live'
          and p.expires_at <= now()
          and p.expires_at + interval '7 days' > now()
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
          p.expires_at as "expiresAt"
        from public.posts as p
        join public.shops as s on s.id = p.shop_id
        left join public.profiles as pr on pr.id = p.author_id
        where public.is_verified_owner(p.shop_id)
          and s.is_demo
          and p.is_seed = false
          and p.status = 'live'
          and p.expires_at > now()
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
